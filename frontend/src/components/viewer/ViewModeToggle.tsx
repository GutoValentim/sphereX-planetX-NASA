import type { ComponentType, SVGProps } from 'react';
import { ChartIcon, ImageIcon } from '../common/icons';
import type { ViewMode } from '../../types/viewer';
import styles from './ViewModeToggle.module.css';

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
}

const OPTIONS: ReadonlyArray<{ value: ViewMode; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }> = [
  { value: 'image', label: 'Image', Icon: ImageIcon },
  { value: 'chart', label: 'Chart', Icon: ChartIcon },
];

function ViewModeToggle({ value, onChange, className }: ViewModeToggleProps) {
  return (
    <div role="group" aria-label="Visualization mode" className={[styles.toggle, className].filter(Boolean).join(' ')}>
      {OPTIONS.map(({ value: mode, label, Icon }) => (
        <button
          key={mode}
          type="button"
          className={styles.option}
          aria-pressed={value === mode}
          onClick={() => onChange(mode)}
        >
          <Icon />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

export default ViewModeToggle;
