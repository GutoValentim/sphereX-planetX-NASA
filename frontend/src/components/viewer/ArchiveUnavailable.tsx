import Button from '../common/Button';
import styles from './ArchiveUnavailable.module.css';

interface ArchiveUnavailableProps {
  /** Technical reason from the API, shown in small print. */
  detail?: string | null;
  onRetry?: () => void;
  /** "dark" over the sky viewer, "surface" on a card. */
  tone?: 'dark' | 'surface';
}

/** Friendly error for live queries: NASA's SPHEREx archive at IRSA is often briefly unavailable. */
function ArchiveUnavailable({ detail, onRetry, tone = 'dark' }: ArchiveUnavailableProps) {
  return (
    <div className={tone === 'dark' ? `${styles.box} ${styles.dark}` : styles.box} role="alert">
      <svg
        className={styles.icon}
        viewBox="0 0 48 48"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="24" cy="24" r="9" />
        <path d="M6 30c4-10 30-20 36-12" />
        <path d="M42 18c2 3-3 8-12 12" opacity="0.5" />
        <path d="M14 10l4 4M38 34l-4-4" />
        <path d="M24 20v5M24 28.5v.5" />
      </svg>
      <p className={styles.title}>SPHEREx data is temporarily unavailable</p>
      <p className={styles.message}>
        NASA&apos;s SPHEREx archive (IRSA, NASA/IPAC) is not responding right now. This usually clears up on its
        own: please try again in a few minutes.
      </p>
      {onRetry && (
        <Button onClick={onRetry} size="sm">
          Try again
        </Button>
      )}
      {detail && <p className={styles.detail}>Details: {detail}</p>}
    </div>
  );
}

export default ArchiveUnavailable;
