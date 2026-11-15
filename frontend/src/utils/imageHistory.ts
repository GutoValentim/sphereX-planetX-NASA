import type { ObservationQuery } from '../types/observation';

const STORAGE_KEY = 'sky-explorer-image-history';
const MAX_ENTRIES = 12;

export interface SavedImage extends ObservationQuery {
  /** ISO timestamp of when the rendered sequence was first kept. */
  savedAt: string;
}

function sameTarget(a: ObservationQuery, b: ObservationQuery): boolean {
  return (
    a.raDeg.toFixed(4) === b.raDeg.toFixed(4) &&
    a.decDeg.toFixed(4) === b.decDeg.toFixed(4) &&
    a.band === b.band &&
    a.observationDate === b.observationDate
  );
}

export function readImageHistory(): SavedImage[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is SavedImage =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as SavedImage).raDeg === 'number' &&
        typeof (entry as SavedImage).decDeg === 'number' &&
        typeof (entry as SavedImage).band === 'string' &&
        typeof (entry as SavedImage).savedAt === 'string',
    );
  } catch {
    return [];
  }
}

/** Keeps the newest render of a coordinate first. The backend cache is what makes reopening fast. */
export function rememberImage(query: ObservationQuery): SavedImage[] {
  const next: SavedImage = { ...query, savedAt: new Date().toISOString() };
  const history = [next, ...readImageHistory().filter((entry) => !sameTarget(entry, query))].slice(0, MAX_ENTRIES);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Storage may be unavailable; the current view still works.
  }
  return history;
}
