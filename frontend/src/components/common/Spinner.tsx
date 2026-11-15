import styles from './Spinner.module.css';

interface SpinnerProps {
  size?: 'sm' | 'md';
}

function Spinner({ size = 'md' }: SpinnerProps) {
  return <span className={`${styles.spinner} ${styles[size]}`} aria-hidden="true" />;
}

export default Spinner;
