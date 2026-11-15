import { useEffect, useState } from 'react';
import { getJob } from '../services/api';

const POLL_MS = 1500;

export interface PolledJobState<T> {
  snapshot: T | null;
  error: string | null;
}

/**
 * Starts a background job once (when `enabled`) and polls its status URL until `isDone` says so.
 * Changing `key` (e.g. a new query) cancels the previous job's polling.
 */
export function usePolledJob<T>(
  key: string,
  enabled: boolean,
  start: (signal: AbortSignal) => Promise<{ status_url: string; job: T }>,
  isDone: (snapshot: T) => boolean,
): PolledJobState<T> {
  const [state, setState] = useState<PolledJobState<T> & { key: string | null }>({
    key: null,
    snapshot: null,
    error: null,
  });

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    let timer: number | undefined;
    setState({ key, snapshot: null, error: null });

    const fail = (error: unknown) => {
      if (controller.signal.aborted) return;
      setState((current) => ({ ...current, key, error: error instanceof Error ? error.message : String(error) }));
    };

    start(controller.signal)
      .then(({ status_url: statusUrl, job }) => {
        const accept = (snapshot: T) => {
          if (controller.signal.aborted) return;
          setState({ key, snapshot, error: null });
          if (!isDone(snapshot)) {
            timer = window.setTimeout(() => {
              getJob<T>(statusUrl, controller.signal).then(accept).catch(fail);
            }, POLL_MS);
          }
        };
        accept(job);
      })
      .catch(fail);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
    // start/isDone are stable for a given key; re-running on their identity would restart the job.
  }, [key, enabled]);

  return state.key === key ? { snapshot: state.snapshot, error: state.error } : { snapshot: null, error: null };
}
