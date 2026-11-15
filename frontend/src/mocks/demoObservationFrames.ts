import type { ObservationFrame } from '../types/observation';

const DEMO_FRAME_COUNT = 8;
const DAYS_BETWEEN_FRAMES = 5;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Development-only timeline frames: timestamps without any scientific content, used to exercise
 * the timeline UI before the backend exists. Never use them in production builds.
 */
export function createDemoObservationFrames(now: Date = new Date()): ObservationFrame[] {
  const startOfTodayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return Array.from({ length: DEMO_FRAME_COUNT }, (_, index) => {
    const daysAgoMs = index * DAYS_BETWEEN_FRAMES * DAY_MS;
    const hourOffsetMs = (index % 4) * 3 * HOUR_MS;

    return {
      id: `demo-${index + 1}`,
      observedAt: new Date(startOfTodayUtc - daysAgoMs + hourOffsetMs).toISOString(),
    };
  });
}
