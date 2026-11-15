import { useTheme } from '../../hooks/useTheme';
import { MoonIcon, SunIcon } from './icons';
import styles from './ThemeToggle.module.css';

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const label = `Switch to ${nextTheme} theme`;

  return (
    <button type="button" className={styles.toggle} onClick={toggleTheme} aria-label={label} title={label}>
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

export default ThemeToggle;
