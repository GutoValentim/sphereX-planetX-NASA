import Spinner from '../common/Spinner';
import styles from './LoadProgress.module.css';

interface LoadProgressProps {
  /** What is happening, e.g. "Rendering SPHEREx images". */
  label: string;
  /** Finished / total units reported by the API; without a total the bar is indeterminate. */
  done?: number;
  total?: number;
  /** Small print under the bar (e.g. "12 of 40 images"). */
  detail?: string;
  /** "panel": centered block; "bar": slim strip over an image that is already showing. */
  variant?: 'panel' | 'bar';
}

/** Real progress of a live SPHEREx job (from the API's done/total), with a percentage. */
function LoadProgress({ label, done = 0, total = 0, detail, variant = 'panel' }: LoadProgressProps) {
  const known = total > 0;
  const percent = known ? Math.min(100, Math.round((done / total) * 100)) : null;

  return (
    <div className={variant === 'bar' ? styles.bar : styles.panel} role="status" aria-live="polite">
      <div className={styles.heading}>
        {variant === 'panel' && <Spinner />}
        <span className={styles.label}>{label}</span>
        {percent !== null && <span className={`text-data ${styles.percent}`}>{percent}%</span>}
      </div>
      <div
        className={styles.track}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        data-indeterminate={percent === null || undefined}
      >
        <span className={styles.fill} style={percent !== null ? { width: `${percent}%` } : undefined} />
      </div>
      {detail && variant === 'panel' && <p className={styles.detail}>{detail}</p>}
    </div>
  );
}

export default LoadProgress;
