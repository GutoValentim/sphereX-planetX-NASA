import { useId } from 'react';
import logoUrl from '../../assets/images/logo-tars-removebg-preview.png';
import styles from './TarsLogo.module.css';

interface TarsLogoProps {
  /** Extra class for sizing in the parent layout. */
  className?: string;
  /** Accessible name. Pass an empty string when nearby text already names the team. */
  alt?: string;
}

/**
 * T.A.R.S. mark. Light theme keeps the original dark artwork.
 * Dark theme inverts it to white. An SVG stroke follows the figure and the letterforms.
 */
function TarsLogo({ className, alt = 'T.A.R.S.' }: TarsLogoProps) {
  const filterId = `tars-logo-outline-${useId().replace(/:/g, '')}`;

  return (
    <span className={[styles.root, className].filter(Boolean).join(' ')}>
      <svg className={styles.defs} aria-hidden="true" focusable="false">
        <filter id={filterId} x="-12%" y="-28%" width="124%" height="156%" colorInterpolationFilters="sRGB">
          <feMorphology in="SourceAlpha" operator="dilate" radius="1.15" result="dilated" />
          <feFlood floodColor="currentColor" result="flood" />
          <feComposite in="flood" in2="dilated" operator="in" result="solid" />
          <feComposite in="solid" in2="SourceAlpha" operator="out" result="ring" />
          <feMerge>
            <feMergeNode in="ring" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </svg>
      <span className={styles.crop}>
        <img
          src={logoUrl}
          alt={alt}
          className={styles.image}
          style={{ ['--tars-filter' as string]: `url(#${filterId})` }}
        />
      </span>
    </span>
  );
}

export default TarsLogo;
