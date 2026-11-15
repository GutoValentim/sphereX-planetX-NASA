import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type express from 'express';

// Alvos pré-mapeados pelo laboratório (dev/temporal-lab), exportados em
// <catálogo>/<motor>/index.json e <motor>/<slug>/manifest.json (schema spherex-lab-target/1).
// A API só lê: junta os motores e, para cada alvo, usa a exportação do motor mais novo.

const ENGINE = /^v(\d{1,4})$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,120}$/;
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/;
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
    const seen = new Set<string>();
    const targets: (CatalogTarget & { engine: string })[] = [];
    for (const engine of await enginesNewestFirst(root)) {
      for (const target of await readTargets(root, engine)) {
        if (seen.has(target.id)) continue;
        seen.add(target.id);
        targets.push({ ...target, engine });
      }
    }
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
    // O alvo é servido inteiro pelo motor mais novo que o exportou (manifesto e arquivos coerentes).
    for (const engine of await enginesNewestFirst(root)) {
      if (!(await isFile(path.join(root, engine, slug, 'manifest.json')))) continue;
      const file = path.join(root, engine, slug, ...segments);
      if (!file.startsWith(path.join(root, engine, slug) + path.sep) || !(await isFile(file))) break;
      res.set('Content-Type', type);
      res.set('Cache-Control', type.startsWith('application/json') ? 'public, max-age=60' : 'public, max-age=86400');
      res.sendFile(file, { dotfiles: 'deny' }, (error) => {
        if (error && !res.headersSent) notFound();
      });
      return;
    }
    notFound();
  });
}
