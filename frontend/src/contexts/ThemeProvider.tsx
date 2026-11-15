import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ThemeContext } from './ThemeContext';
import type { Theme } from '../types/theme';
import {
  readStoredTheme,
  resolveInitialTheme,
  storeTheme,
  subscribeToSystemTheme,
} from '../utils/themePreference';
import { applyTheme, applyThemeWithTransition } from '../utils/themeTransition';

interface ThemeProviderProps {
  children: ReactNode;
}

function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(resolveInitialTheme);
  const [hasUserPreference, setHasUserPreference] = useState(() => readStoredTheme() !== null);

  const isInitialTheme = useRef(true);

  useEffect(() => {
    if (isInitialTheme.current) {
      isInitialTheme.current = false;
      applyTheme(theme);
      return;
    }
    applyThemeWithTransition(theme);
  }, [theme]);

  useEffect(() => {
    if (hasUserPreference) return undefined;
    return subscribeToSystemTheme(setTheme);
  }, [hasUserPreference]);

  const toggleTheme = useCallback(() => {
    const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark';
    storeTheme(nextTheme);
    setHasUserPreference(true);
    setTheme(nextTheme);
  }, [theme]);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export default ThemeProvider;
