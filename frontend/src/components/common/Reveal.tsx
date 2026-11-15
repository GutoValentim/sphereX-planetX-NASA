import type { CSSProperties, ReactNode } from 'react';
import { useRevealOnScroll } from '../../hooks/useRevealOnScroll';
import styles from './Reveal.module.css';

interface RevealProps {
  children: ReactNode;
  /** Staggers sibling reveals, e.g. index × 100 ms. */
  delayMs?: number;
}

/** Fades content in with a subtle upward shift the first time it scrolls into view. */
function Reveal({ children, delayMs = 0 }: RevealProps) {
  const { ref, isRevealed } = useRevealOnScroll<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={styles.reveal}
      data-revealed={isRevealed}
      style={{ '--reveal-delay': `${delayMs}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}

export default Reveal;
