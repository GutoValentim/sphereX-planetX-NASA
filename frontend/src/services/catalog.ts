import { apiUrl, type SequenceLayer, type SpectrumBand } from './api';

/**
 * Catalog of targets pre-mapped by the lab (dev/temporal-lab), served read-only by the API at
 * /api/catalogo (index.json + <slug>/manifest.json, schema spherex-lab-target/1; the newest
 * engine wins per target). VITE_CATALOG_URL overrides the base; an empty value disables it.
 */
const CATALOG_URL = (import.meta.env.VITE_CATALOG_URL ?? apiUrl('/api/catalogo')).replace(/\/+$/, '');

export const CATALOG_ENABLED = CATALOG_URL !== '';

export interface CatalogEntry {
  id: string;
  slug: string;
  name: string;
  description: string;
  ra_deg: number;
  dec_deg: number;
  manifest: string;
  sequences: string[];
  spectrum_themes: string[];
  exported_at: string;
}

interface CatalogIndex {
  schema: string;
  targets: CatalogEntry[];
}

export interface CatalogSequence {
  key: string;
  fov_arcmin: number;
  sampling: string;
  render_profile: string;
  color_mode: 'color' | 'mono';
  anchor_bandpass: string;
  bandpasses: string[];
  omitted_bandpasses: string[];
  frames: { id: string; observed_at: string; anchor_bandpass: string; layers: SequenceLayer[] }[];
}

export interface CatalogSpectrum {
  combined_chart_url: string | null;
  bands: (SpectrumBand & { chart_url?: string | null })[];
}

export interface CatalogManifest {
  schema: string;
  id: string;
  slug: string;
  name: string;
  description: string;
  ra_deg: number;
  dec_deg: number;
  exported_at: string;
  sequences: CatalogSequence[];
  spectrum: Partial<Record<'dark' | 'light', CatalogSpectrum>>;
}

/** Absolute URL of a file inside a target's export folder (manifest URLs are relative to it). */
export function catalogFileUrl(slug: string, path: string): string {
  return /^https?:\/\//.test(path) ? path : `${CATALOG_URL}/${slug}/${path}`;
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${CATALOG_URL}/${path}`, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(`Mapped targets are unavailable (HTTP ${response.status}).`);
  return (await response.json()) as T;
}

export async function fetchCatalog(signal?: AbortSignal): Promise<CatalogEntry[]> {
  if (!CATALOG_ENABLED) return [];
  const index = await getJson<CatalogIndex>('index.json', signal);
  return [...(index.targets ?? [])].sort((a, b) => a.name.localeCompare(b.name));
}

export function fetchManifest(entry: Pick<CatalogEntry, 'slug' | 'manifest'>, signal?: AbortSignal) {
  return getJson<CatalogManifest>(entry.manifest ?? `${entry.slug}/manifest.json`, signal);
}
