import type { ReactNode } from 'react';
import Header from './Header';
import Footer from './Footer';
import type { RouteTarget } from '../../routes/paths';
import styles from './PageContainer.module.css';

interface PageContainerProps {
  title?: string;
  backTo?: RouteTarget;
  /** "full" lets sections span the whole width (e.g. a hero); they then handle their own inner width. */
  width?: 'contained' | 'full';
  children: ReactNode;
}

function PageContainer({ title, backTo, width = 'contained', children }: PageContainerProps) {
  return (
    <div className={styles.page}>
      <Header title={title} backTo={backTo} />
      <main className={width === 'full' ? styles.fullContent : styles.content}>{children}</main>
      <Footer />
    </div>
  );
}

export default PageContainer;
