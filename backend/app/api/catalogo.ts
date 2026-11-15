import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type express from 'express';

// Alvos pré-mapeados pelo laboratório (dev/temporal-lab), exportados em
// <catálogo>/<motor>/index.json e <motor>/<slug>/manifest.json (schema spherex-lab-target/1).
// A API só lê e junta os motores. Para cada alvo vale o motor mais novo cuja exportação está
// 100% pronta (imagens e espectro das seis bandas); se nenhuma está, fica a do motor mais antigo,
// a que já estava publicada — um motor novo nunca substitui um alvo com dados parciais.

const ENGINE = /^v(\d{1,4})$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,120}$/;
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/;
const ALL_BANDS = ['SPHEREx-D1', 'SPHEREx-D2', 'SPHEREx-D3', 'SPHEREx-D4', 'SPHEREx-D5', 'SPHEREx-D6'];
const CONTENT_TYPES: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

interface CatalogTarget {
  id: string;
  slug: string;
  name: string;
  [key: string]: unknown;
}

async function enginesNewestFirst(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && ENGINE.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)));
  } catch {
    return [];
  }
}

async function readTargets(root: string, engine: string): Promise<CatalogTarget[]> {
  try {
    const index = JSON.parse(await readFile(path.join(root, engine, 'index.json'), 'utf8')) as { targets?: unknown };
    return Array.isArray(index.targets)
      ? index.targets.filter((target): target is CatalogTarget =>
        Boolean(target) && typeof target.id === 'string' && typeof target.slug === 'string' && SLUG.test(target.slug))
      : [];
  } catch {
    return [];
  }
}

interface ManifestSummary {
  sequences?: { bandpasses?: unknown; omitted_bandpasses?: unknown }[];
  spectrum?: Record<string, { bands?: { bandpass?: unknown; chart_url?: unknown; error?: unknown }[] } | undefined>;
}

/** Images: every exported sequence has all six bands, none omitted. Spectrum: both themes, six charts. */
export function isCompleteExport(manifest: ManifestSummary): boolean {
  const sequences = Array.isArray(manifest.sequences) ? manifest.sequences : [];
  const imagesReady = sequences.length > 0 && sequences.every((sequence) => {
    const bands = Array.isArray(sequence.bandpasses) ? sequence.bandpasses : [];
    const omitted = Array.isArray(sequence.omitted_bandpasses) ? sequence.omitted_bandpasses : [];
    return omitted.length === 0 && ALL_BANDS.every((band) => bands.includes(band));
  });
  const spectrumReady = ['dark', 'light'].every((theme) => {
    const bands = manifest.spectrum?.[theme]?.bands ?? [];
    return ALL_BANDS.every((band) => bands.some((item) =>
      item.bandpass === band && typeof item.chart_url === 'string' && item.chart_url !== '' && !item.error));
  });
  return imagesReady && spectrumReady;
}

const completeness = new Map<string, { mtimeMs: number; complete: boolean }>();

/** Cached by file modification time: manifests are rewritten when the lab exports again. */
async function manifestIsComplete(file: string): Promise<boolean> {
  try {
    const { mtimeMs } = await stat(file);
    const cached = completeness.get(file);
    if (cached && cached.mtimeMs === mtimeMs) return cached.complete;
    const complete = isCompleteExport(JSON.parse(await readFile(file, 'utf8')) as ManifestSummary);
    completeness.set(file, { mtimeMs, complete });
    return complete;
  } catch {
    return false;
  }
}

/** Engine that serves each target (by id), following the rule at the top of this file. */
async function resolveTargets(root: string): Promise<Map<string, CatalogTarget & { engine: string }>> {
  const candidates = new Map<string, (CatalogTarget & { engine: string })[]>();
  for (const engine of await enginesNewestFirst(root)) {
    for (const target of await readTargets(root, engine)) {
      if (!(await isFile(path.join(root, engine, target.slug, 'manifest.json')))) continue;
      const list = candidates.get(target.id) ?? [];
      list.push({ ...target, engine });
      candidates.set(target.id, list);
    }
  }
  const chosen = new Map<string, CatalogTarget & { engine: string }>();
  for (const [id, list] of candidates) {
    let pick: (CatalogTarget & { engine: string }) | undefined;
    for (const candidate of list) {
      if (await manifestIsComplete(path.join(root, candidate.engine, candidate.slug, 'manifest.json'))) {
        pick = candidate;
        break;
      }
    }
    chosen.set(id, pick ?? list[list.length - 1]);
  }
  return chosen;
}

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

export function registerCatalog(app: express.Express, catalogDir: string | undefined) {
  const root = catalogDir ? path.resolve(catalogDir) : null;

  app.get('/api/catalogo/index.json', async (_req, res) => {
    if (!root) {
      res.status(503).json({ erro: 'Catálogo de alvos mapeados não configurado.' });
      return;
    }
    const targets = [...(await resolveTargets(root)).values()];
    targets.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ schema: 'spherex-catalog/1', targets });
  });

  app.get('/api/catalogo/:slug/*file', async (req, res) => {
    const notFound = () => res.status(404).json({ erro: 'Arquivo não encontrado.' });
    if (!root) {
      res.status(503).json({ erro: 'Catálogo de alvos mapeados não configurado.' });
      return;
    }
    const { slug } = req.params;
    const raw = (req.params as Record<string, unknown>).file;
    const segments = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? raw.split('/') : [];
    const type = CONTENT_TYPES[path.extname(segments.at(-1) ?? '').toLowerCase()];
    if (!SLUG.test(slug) || segments.length === 0 || segments.length > 8 ||
        !segments.every((segment) => SEGMENT.test(segment) && !segment.includes('..')) || !type) {
      notFound();
      return;
    }
    // O alvo é servido inteiro pelo motor escolhido no índice (manifesto e arquivos coerentes).
    const target = [...(await resolveTargets(root)).values()].find((item) => item.slug === slug);
    if (!target) {
      notFound();
      return;
    }
    const folder = path.join(root, target.engine, slug);
    const file = path.join(folder, ...segments);
    if (!file.startsWith(folder + path.sep) || !(await isFile(file))) {
      notFound();
      return;
    }
    res.set('Content-Type', type);
    res.set('Cache-Control', type.startsWith('application/json') ? 'public, max-age=60' : 'public, max-age=86400');
    res.sendFile(file, { dotfiles: 'deny' }, (error) => {
      if (error && !res.headersSent) notFound();
    });
  });
}
