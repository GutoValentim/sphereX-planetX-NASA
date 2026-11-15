import { useMemo } from 'react';
import { createDemoObservationFrames } from '../mocks/demoObservationFrames';
import type { ObservationFrameSource } from '../types/observation';

/**
 * Source of the observation sequence shown in the timeline.
 * Integration point: replace the demo branch with the backend request once its contract is defined.
 */
export function useObservationFrames(): ObservationFrameSource {
  return useMemo<ObservationFrameSource>(
    () => (import.meta.env.DEV ? { frames: createDemoObservationFrames(), isDemo: true } : { frames: [], isDemo: false }),
    [],
  );
}
