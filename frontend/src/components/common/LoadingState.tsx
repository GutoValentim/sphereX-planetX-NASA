import Spinner from './Spinner';
import styles from './StatusState.module.css';

interface LoadingStateProps {
  message?: string;
}

function LoadingState({ message = 'Loading…' }: LoadingStateProps) {
  return (
    <div className={styles.state} role="status" aria-live="polite">
      <span className={styles.spinner}>
        <Spinner />
      </span>
      <p className={styles.message}>{message}</p>
    </div>
  );
}

export default LoadingState;
