import type { ReactNode } from 'react';
import styles from './StatusState.module.css';

interface EmptyStateProps {
  title: string;
  message?: string;
  /** Optional call to action, e.g. a ButtonLink. */
  action?: ReactNode;
  /** Element used for the title; use a heading when the state is the page's main content. */
  titleAs?: 'h1' | 'h2' | 'h3' | 'p';
}

function EmptyState({ title, message, action, titleAs: TitleTag = 'p' }: EmptyStateProps) {
  return (
    <div className={styles.state}>
      <TitleTag className={styles.title}>{title}</TitleTag>
      {message && <p className={styles.message}>{message}</p>}
      {action}
    </div>
  );
}

export default EmptyState;
