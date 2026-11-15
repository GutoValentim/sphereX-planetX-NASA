import type { ComponentType, SVGProps } from 'react';
import { useTheme } from '../../hooks/useTheme';
import type { ThemePreference } from '../../types/theme';
import { MonitorIcon, MoonIcon, SunIcon } from './icons';
import styles from './ThemeSwitcher.module.css';

interface ThemeOption {
  value: ThemePreference;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const OPTIONS: readonly ThemeOption[] = [
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
  { value: 'system', label: 'System', Icon: MonitorIcon },
];

/** Light / Dark / System theme selector built on native radios for built-in keyboard support. */
function ThemeSwitcher() {
  const { preference, setPreference } = useTheme();

  return (
    <fieldset className={styles.switcher}>
      <legend className="visually-hidden">Color theme</legend>
      {OPTIONS.map(({ value, label, Icon }) => (
        <label key={value} className={styles.option} title={`${label} theme`}>
          <input
            type="radio"
            name="color-theme"
            value={value}
            checked={preference === value}
            onChange={() => setPreference(value)}
            className={styles.input}
          />
          <Icon width={18} height={18} />
          <span className="visually-hidden">{label}</span>
        </label>
      ))}
    </fieldset>
  );
}

export default ThemeSwitcher;
