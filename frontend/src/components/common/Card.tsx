import type { HTMLAttributes } from 'react';
import styles from './Card.module.css';

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'section' | 'article' | 'aside';
  /** `muted` sits on the page as a recessed panel; `raised` stands above surrounding surfaces. */
  tone?: 'default' | 'muted' | 'raised';
  padding?: 'sm' | 'md' | 'lg';
}

/** Bordered content surface. Prefer whitespace over nesting cards inside cards. */
function Card({ as: Element = 'div', tone = 'default', padding = 'md', className, ...rest }: CardProps) {
  const classes = [styles.card, styles[tone], styles[padding], className].filter(Boolean).join(' ');
  return <Element className={classes} {...rest} />;
}

export default Card;
