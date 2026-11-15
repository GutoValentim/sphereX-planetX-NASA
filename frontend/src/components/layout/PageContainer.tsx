import type { ReactNode } from 'react';
import Header from './Header';
import Footer from './Footer';
import type { RouteTarget } from '../../routes/paths';
import styles from './PageContainer.module.css';

interface PageContainerProps {
  title?: string;
  backTo?: RouteTarget;
  /**
   * "full" lets sections span the whole width (e.g. a hero); they then handle their own inner width.
   * "wide" keeps the gutters but allows a larger content width (e.g. the image viewer).
   */
  width?: 'contained' | 'wide' | 'full';
  /** Extra navigation in the header (next to the theme switcher). */
  nav?: ReactNode;
  children: ReactNode;
}

const MAIN_CLASS = { contained: styles.content, wide: `${styles.content} ${styles.wideContent}`, full: styles.fullContent };

function PageContainer({ title, backTo, width = 'contained', nav, children }: PageContainerProps) {
  return (
    <div className={styles.page}>
      <Header title={title} backTo={backTo} nav={nav} />
      <main className={MAIN_CLASS[width]}>{children}</main>
      <Footer />
    </div>
  );
}

export default PageContainer;
