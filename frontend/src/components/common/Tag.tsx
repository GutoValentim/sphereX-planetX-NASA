import type { ReactNode } from 'react';
import styles from './Tag.module.css';

interface TagProps {
  children: ReactNode;
  className?: string;
}

/** Small dashed label for provisional or non-final content (drafts, demo values). */
function Tag({ children, className }: TagProps) {
  return <span className={className ? `${styles.tag} ${className}` : styles.tag}>{children}</span>;
}

export default Tag;
