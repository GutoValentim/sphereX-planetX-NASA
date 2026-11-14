import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ObservationFrame } from '../types/observation';
import { formatUtcDateTime } from '../utils/dateFormatting';

const DEFAULT_INTERVAL_MS = 1500;

interface UseTimelineOptions {
  /** Requested ISO date (YYYY-MM-DD); the first frame on that date is selected initially. */
  preferredDate?: string | null;
  intervalMs?: number;
}

function sortNewestFirst(frames: readonly ObservationFrame[]): ObservationFrame[] {
  return [...frames].sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
}

function findPreferredIndex(frames: readonly ObservationFrame[], preferredDate?: string | null): number {
  if (!preferredDate) return 0;
  const index = frames.findIndex((frame) => formatUtcDateTime(frame.observedAt)?.isoDate === preferredDate);
  return index >= 0 ? index : 0;
}

/**
 * Temporal navigation over observations ordered from newest (index 0) to oldest.
 * The selection is stored by frame id, so it survives frames arriving or being re-sorted.
 * Playback stops on the oldest frame; playing again restarts from the newest.
 */
export function useTimeline(frames: readonly ObservationFrame[], options: UseTimelineOptions = {}) {
  const { preferredDate, intervalMs = DEFAULT_INTERVAL_MS } = options;

  const sortedFrames = useMemo(() => sortNewestFirst(frames), [frames]);
  const lastIndex = sortedFrames.length - 1;

  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const selectedIndex = selectedFrameId ? sortedFrames.findIndex((frame) => frame.id === selectedFrameId) : -1;
  const activeIndex = selectedIndex >= 0 ? selectedIndex : findPreferredIndex(sortedFrames, preferredDate);
  const activeFrame = sortedFrames[activeIndex] ?? null;

  const selectIndex = useCallback(
    (index: number) => {
      const clamped = Math.min(Math.max(index, 0), lastIndex);
      setSelectedFrameId(sortedFrames[clamped]?.id ?? null);
    },
    [lastIndex, sortedFrames],
  );

  /** Manual navigation pauses playback so the user keeps control. */
  const goTo = useCallback(
    (index: number) => {
      setIsPlaying(false);
      selectIndex(index);
    },
    [selectIndex],
  );

  const goToNewer = useCallback(() => goTo(activeIndex - 1), [activeIndex, goTo]);
  const goToOlder = useCallback(() => goTo(activeIndex + 1), [activeIndex, goTo]);

  const canPlay = sortedFrames.length > 1;

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    if (!canPlay) return;
    if (activeIndex >= lastIndex) {
      selectIndex(0);
    }
    setIsPlaying(true);
  }, [activeIndex, canPlay, isPlaying, lastIndex, selectIndex]);

  useEffect(() => {
    if (!isPlaying || activeIndex >= lastIndex) return undefined;

    const timeoutId = window.setTimeout(() => {
      const nextIndex = activeIndex + 1;
      selectIndex(nextIndex);
      if (nextIndex >= lastIndex) setIsPlaying(false);
    }, intervalMs);

    return () => window.clearTimeout(timeoutId);
  }, [activeIndex, intervalMs, isPlaying, lastIndex, selectIndex]);

  return {
    frames: sortedFrames,
    activeIndex,
    activeFrame,
    isPlaying,
    canPlay,
    canGoNewer: activeIndex > 0,
    canGoOlder: activeIndex < lastIndex,
    goTo,
    goToNewer,
    goToOlder,
    togglePlay,
  };
}
