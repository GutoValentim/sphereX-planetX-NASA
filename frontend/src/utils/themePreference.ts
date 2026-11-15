import type { Theme, ThemePreference } from '../types/theme';

// Must match the key used by the inline script in index.html.
export const THEME_STORAGE_KEY = 'sky-explorer-theme';

const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function readStoredPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function storePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage may be unavailable (e.g. private mode); the theme still applies for the session.
  }
}

export function getSystemTheme(): Theme {
  return window.matchMedia(DARK_SCHEME_QUERY).matches ? 'dark' : 'light';
}

export function subscribeToSystemTheme(onChange: (theme: Theme) => void): () => void {
  const mediaQuery = window.matchMedia(DARK_SCHEME_QUERY);
  const handleChange = (event: MediaQueryListEvent) => onChange(event.matches ? 'dark' : 'light');

  mediaQuery.addEventListener('change', handleChange);
  return () => mediaQuery.removeEventListener('change', handleChange);
}
