import { useCallback, useMemo } from 'react';
import { usePolledJob } from './usePolledJob';
import { startSpectrum, type SpectrumSnapshot } from '../services/api';
import type { ObservationQuery } from '../types/observation';

export interface SpectrumState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  snapshot: SpectrumSnapshot | null;
  error: string | null;
  /** Measured observations / known observations, over all bands. */
  progress: { done: number; total: number };
}

/** Starts the spectrum job the first time the chart is shown (it measures every observation). */
export function useSpectrum(query: ObservationQuery, enabled: boolean): SpectrumState {
  const key = `${query.raDeg}:${query.decDeg}`;
  const start = useCallback((signal: AbortSignal) => startSpectrum(query, signal), [query]);
  const isDone = useCallback((snapshot: SpectrumSnapshot) => snapshot.status !== 'running', []);
  const { snapshot, error } = usePolledJob<SpectrumSnapshot>(key, enabled, start, isDone);

  return useMemo<SpectrumState>(() => {
    const progress = Object.values(snapshot?.progress ?? {}).reduce<{ done: number; total: number }>(
      (sum, item) => ({ done: sum.done + (item.done ?? 0), total: sum.total + (item.total ?? 0) }),
      { done: 0, total: 0 },
    );
    if (!enabled) return { status: 'idle', snapshot: null, error: null, progress };
    if (error) return { status: 'error', snapshot: null, error, progress };
    if (snapshot?.status === 'failed') {
      return { status: 'error', snapshot, error: snapshot.error ?? 'The spectrum could not be measured.', progress };
    }
    if (snapshot?.status === 'completed') return { status: 'ready', snapshot, error: null, progress };
    return { status: 'loading', snapshot, error: null, progress };
  }, [enabled, snapshot, error]);
}
