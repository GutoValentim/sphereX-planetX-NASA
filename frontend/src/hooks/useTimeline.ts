import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ObservationFrame } from '../types/observation';
import { formatUtcDateTime } from '../utils/dateFormatting';

/** 1× plays two frames per second. The other rates scale this interval. */
const BASE_INTERVAL_MS = 500;

export const TIMELINE_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export type TimelineSpeed = (typeof TIMELINE_SPEEDS)[number];

interface UseTimelineOptions {
  /** Requested ISO date (YYYY-MM-DD); the first frame on that date is selected initially. */
  preferredDate?: string | null;
}

function sortOldestFirst(frames: readonly ObservationFrame[]): ObservationFrame[] {
  return [...frames].sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
}

function findPreferredIndex(frames: readonly ObservationFrame[], preferredDate?: string | null): number {
  if (!preferredDate) return 0;
  const index = frames.findIndex((frame) => formatUtcDateTime(frame.observedAt)?.isoDate === preferredDate);
  return index >= 0 ? index : 0;
}

/**
 * Temporal navigation over observations ordered from oldest (index 0) to newest.
 * The selection is stored by frame id, so it survives frames arriving or being re-sorted.
 * Playback stops on the newest frame; playing again restarts from the oldest.
 */
export function useTimeline(frames: readonly ObservationFrame[], options: UseTimelineOptions = {}) {
  const { preferredDate } = options;
  const [playbackRate, setPlaybackRate] = useState<TimelineSpeed>(1);
  const intervalMs = BASE_INTERVAL_MS / playbackRate;

  const sortedFrames = useMemo(() => sortOldestFirst(frames), [frames]);
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

  const goToOlder = useCallback(() => goTo(activeIndex - 1), [activeIndex, goTo]);
  const goToNewer = useCallback(() => goTo(activeIndex + 1), [activeIndex, goTo]);

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
    canGoOlder: activeIndex > 0,
    canGoNewer: activeIndex < lastIndex,
    playbackRate,
    setPlaybackRate,
    goTo,
    goToNewer,
    goToOlder,
    togglePlay,
  };
}
