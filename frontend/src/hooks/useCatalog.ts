import { useEffect, useState, useSyncExternalStore } from 'react';
import { CATALOG_ENABLED, fetchCatalog, fetchManifest, type CatalogEntry, type CatalogManifest } from '../services/catalog';

/** New targets show up without a reload: the index is re-read while a page uses it. */
const REFRESH_MS = 60_000;

interface CatalogState {
  status: 'disabled' | 'loading' | 'ready' | 'error';
  targets: readonly CatalogEntry[];
  error: string | null;
}

let state: CatalogState = CATALOG_ENABLED
  ? { status: 'loading', targets: [], error: null }
  : { status: 'disabled', targets: [], error: null };
const listeners = new Set<() => void>();
let timer: number | undefined;
let inFlight: AbortController | null = null;

function emit(next: CatalogState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function sameTargets(a: readonly CatalogEntry[], b: readonly CatalogEntry[]) {
  return a.length === b.length && a.every((entry, index) => entry.id === b[index].id && entry.exported_at === b[index].exported_at);
}

function refresh() {
  inFlight?.abort();
  const controller = new AbortController();
  inFlight = controller;
  fetchCatalog(controller.signal)
    .then((targets) => {
      if (state.status === 'ready' && sameTargets(state.targets, targets)) return;
      emit({ status: 'ready', targets, error: null });
    })
    .catch((error: unknown) => {
      if (controller.signal.aborted) return;
      // Keep showing the last known list if a refresh fails.
      if (state.status !== 'ready') emit({ status: 'error', targets: [], error: String((error as Error).message ?? error) });
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (CATALOG_ENABLED && listeners.size === 1) {
    refresh();
    timer = window.setInterval(refresh, REFRESH_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.clearInterval(timer);
      inFlight?.abort();
    }
  };
}

/** Targets already mapped by the lab, kept up to date while mounted. */
export function useCatalog(): CatalogState {
  return useSyncExternalStore(subscribe, () => state);
}

export interface ManifestState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  manifest: CatalogManifest | null;
  error: string | null;
}

/** Loads one target's manifest (frames and spectrum) by slug. */
export function useCatalogManifest(slug: string | null): ManifestState {
  const [result, setResult] = useState<{ slug: string | null } & ManifestState>({
    slug: null,
    status: 'idle',
    manifest: null,
    error: null,
  });

  useEffect(() => {
    if (!slug) return undefined;
    const controller = new AbortController();
    setResult({ slug, status: 'loading', manifest: null, error: null });
    fetchManifest({ slug, manifest: `${slug}/manifest.json` }, controller.signal)
      .then((manifest) => setResult({ slug, status: 'ready', manifest, error: null }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ slug, status: 'error', manifest: null, error: String((error as Error).message ?? error) });
      });
    return () => controller.abort();
  }, [slug]);

  if (!slug) return { status: 'idle', manifest: null, error: null };
  if (result.slug !== slug) return { status: 'loading', manifest: null, error: null };
  return result;
}
