/** Theme actually applied to the document. */
export type Theme = 'light' | 'dark';

/** User choice; `system` follows the OS color scheme. */
export type ThemePreference = Theme | 'system';

export interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}
