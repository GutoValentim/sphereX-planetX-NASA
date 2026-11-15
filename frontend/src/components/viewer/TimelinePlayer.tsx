import { ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon } from '../common/icons';
import type { ObservationFrame } from '../../types/observation';
import { formatUtcDateTime } from '../../utils/dateFormatting';
import styles from './TimelinePlayer.module.css';

interface TimelinePlayerProps {
  /** Frames ordered from newest (index 0) to oldest. */
  frames: readonly ObservationFrame[];
  activeIndex: number;
  isPlaying: boolean;
  canPlay: boolean;
  canGoNewer: boolean;
  canGoOlder: boolean;
  isDemo: boolean;
  onSelect: (index: number) => void;
  onNewer: () => void;
  onOlder: () => void;
  onTogglePlay: () => void;
  className?: string;
}

function describeFrame(frame: ObservationFrame | undefined): string {
  const parts = frame ? formatUtcDateTime(frame.observedAt) : null;
  return parts ? `${parts.date} · ${parts.time}` : 'Unknown date';
}

function TimelinePlayer({
  frames,
  activeIndex,
  isPlaying,
  canPlay,
  canGoNewer,
  canGoOlder,
  isDemo,
  onSelect,
  onNewer,
  onOlder,
  onTogglePlay,
  className,
}: TimelinePlayerProps) {
  const rootClassName = [styles.timeline, className].filter(Boolean).join(' ');

  if (frames.length === 0) {
    return (
      <section className={rootClassName} aria-labelledby="timeline-title">
        <h2 id="timeline-title" className={styles.title}>
          Observation timeline
        </h2>
        <p className={styles.empty}>
          No observations loaded yet. Observations will be listed here from newest to oldest once the backend
          provides them.
        </p>
      </section>
    );
  }

  const lastIndex = frames.length - 1;
  const activeDescription = describeFrame(frames[activeIndex]);

  return (
    <section className={rootClassName} aria-labelledby="timeline-title">
      <div className={styles.header}>
        <h2 id="timeline-title" className={styles.title}>
          Observation timeline
        </h2>
        {isDemo && <span className={styles.demoBadge}>Demo data — not real observations</span>}
      </div>

      <div className={styles.current} aria-live={isPlaying ? 'off' : 'polite'}>
        <span className={styles.currentDate}>{activeDescription}</span>
        <span className={styles.position}>
          {activeIndex + 1} / {frames.length}
        </span>
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.controlButton}
          onClick={onNewer}
          disabled={!canGoNewer}
          aria-label="Newer observation"
          title="Newer observation"
        >
          <ChevronLeftIcon />
        </button>
        <button
          type="button"
          className={`${styles.controlButton} ${styles.playButton}`}
          onClick={onTogglePlay}
          disabled={!canPlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          type="button"
          className={styles.controlButton}
          onClick={onOlder}
          disabled={!canGoOlder}
          aria-label="Older observation"
          title="Older observation"
        >
          <ChevronRightIcon />
        </button>

        <div className={styles.sliderGroup}>
          <label htmlFor="timeline-slider" className="visually-hidden">
            Select observation
          </label>
          <input
            id="timeline-slider"
            type="range"
            className={styles.slider}
            min={0}
            max={lastIndex}
            step={1}
            value={activeIndex}
            disabled={frames.length < 2}
            aria-valuetext={activeDescription}
            onChange={(event) => onSelect(Number(event.target.value))}
          />
          <div className={styles.sliderLabels} aria-hidden="true">
            <span>Newest</span>
            <span>Oldest</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default TimelinePlayer;
