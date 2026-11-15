import type { ComponentType, SVGProps } from 'react';
import styles from './ViewModeToggle.module.css';

export type ImageSource = 'spherex' | 'reference';

interface ImageSourceToggleProps {
  value: ImageSource;
  onChange: (source: ImageSource) => void;
  className?: string;
}

function SatelliteIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="9" y="9" width="6" height="6" rx="1" transform="rotate(45 12 12)" />
      <path d="M4.5 4.5l3 3M16.5 16.5l3 3M7.5 4.5l-3 3M19.5 16.5l-3 3" />
      <path d="M15 19a4 4 0 0 0 4-4M15 22a7 7 0 0 0 7-7" />
    </svg>
  );
}

function TelescopeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m4 13 12-6 2 4-12 6z" />
      <path d="m16 7 3-1.5 2 4L18 11" />
      <path d="M10 15.5 7 21M11 15l3 6" />
    </svg>
  );
}

const OPTIONS: ReadonlyArray<{ value: ImageSource; label: string; title: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }> = [
  { value: 'spherex', label: 'SPHEREx', title: 'SPHEREx images', Icon: SatelliteIcon },
  { value: 'reference', label: 'DSS2', title: 'Reference sky (DSS2 survey, not SPHEREx data)', Icon: TelescopeIcon },
];

/** Image source (SPHEREx or the DSS2 reference sky), shown under Image/Chart in image mode. */
function ImageSourceToggle({ value, onChange, className }: ImageSourceToggleProps) {
  return (
    <div role="group" aria-label="Image source" className={[styles.toggle, className].filter(Boolean).join(' ')}>
      {OPTIONS.map(({ value: source, label, title, Icon }) => (
        <button
          key={source}
          type="button"
          className={styles.option}
          aria-pressed={value === source}
          title={title}
          onClick={() => onChange(source)}
        >
          <Icon />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

export default ImageSourceToggle;
