import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ThemeContext } from './ThemeContext';
import type { Theme, ThemePreference } from '../types/theme';
import {
  getSystemTheme,
  readStoredPreference,
  storePreference,
  subscribeToSystemTheme,
} from '../utils/themePreference';
import { applyTheme, applyThemeWithTransition } from '../utils/themeTransition';

interface ThemeProviderProps {
  children: ReactNode;
}

function ThemeProvider({ children }: ThemeProviderProps) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [systemTheme, setSystemTheme] = useState<Theme>(getSystemTheme);
  const theme: Theme = preference === 'system' ? systemTheme : preference;

  const isInitialTheme = useRef(true);

  useEffect(() => {
    if (isInitialTheme.current) {
      isInitialTheme.current = false;
      applyTheme(theme);
      return;
    }
    applyThemeWithTransition(theme);
  }, [theme]);

  useEffect(() => subscribeToSystemTheme(setSystemTheme), []);

  const value = useMemo(
    () => ({
      theme,
      preference,
      setPreference: (next: ThemePreference) => {
        storePreference(next);
        setPreferenceState(next);
      },
    }),
    [theme, preference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export default ThemeProvider;
