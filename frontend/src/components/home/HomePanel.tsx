import type { ReactNode } from 'react';
import Tag from '../common/Tag';
import styles from './HomePanel.module.css';

interface HomePanelProps {
  id: string;
  title: string;
  isDraft: boolean;
  children: ReactNode;
}

/** One sheet in the Home stack. Sections sit one under the other and reveal as they are scrolled to. */
function HomePanel({ id, title, isDraft, children }: HomePanelProps) {
  const titleId = `home-section-${id}`;

  return (
    <article className={styles.panel} aria-labelledby={titleId}>
      <header className={styles.header}>
        {isDraft && <Tag>Draft</Tag>}
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
      </header>
      {children}
    </article>
  );
}

export default HomePanel;
