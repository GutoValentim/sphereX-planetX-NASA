import { useCallback, useMemo } from 'react';
import { usePolledJob } from './usePolledJob';
import { startImageSequence, type SequenceSnapshot } from '../services/api';
import type { ObservationFrameSource, ObservationQuery } from '../types/observation';
import { toObservationFrames } from '../utils/apiMapping';

const RUNNING = new Set(['discovering', 'rendering']);

/**
 * Real SPHEREx observations for the query: the timeline appears as soon as the epochs are known,
 * and each band image fills in as the backend finishes aligning and rendering it.
 */
export function useObservationFrames(query: ObservationQuery): ObservationFrameSource {
  const key = `${query.raDeg}:${query.decDeg}:${query.band}:${query.observationDate ?? ''}`;
  const start = useCallback((signal: AbortSignal) => startImageSequence(query, signal), [query]);
  const isDone = useCallback((snapshot: SequenceSnapshot) => !RUNNING.has(snapshot.status), []);
  const { snapshot, error } = usePolledJob<SequenceSnapshot>(key, true, start, isDone);

  return useMemo<ObservationFrameSource>(() => {
    if (error) return { frames: [], isDemo: false, status: 'error', error };
    if (!snapshot) return { frames: [], isDemo: false, status: 'loading' };
    if (snapshot.status === 'failed') {
      return { frames: [], isDemo: false, status: 'error', error: snapshot.error ?? 'The sequence could not be built.' };
    }
    return {
      frames: toObservationFrames(snapshot),
      isDemo: false,
      status: RUNNING.has(snapshot.status) ? (snapshot.status === 'discovering' ? 'loading' : 'rendering') : 'ready',
      error: null,
      progress: snapshot.progress,
    };
  }, [snapshot, error]);
}
