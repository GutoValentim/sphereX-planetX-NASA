import type { ReactNode } from 'react';
import styles from './VisualizationPlaceholder.module.css';

interface VisualizationPlaceholderProps {
  icon: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
}

/** Marks an area reserved for a future integration; never shows simulated data. */
function VisualizationPlaceholder({ icon, title, description, children }: VisualizationPlaceholderProps) {
  return (
    <div className={styles.placeholder}>
      <span className={styles.icon}>{icon}</span>
      <p className={styles.title}>{title}</p>
      <p className={styles.description}>{description}</p>
      {children}
    </div>
  );
}

export default VisualizationPlaceholder;
