import type { Theme } from '../types/theme';

// Must match the attribute used in globals.css.
const SWITCHING_ATTRIBUTE = 'data-theme-switching';
const SWITCHING_DURATION_MS = 400;

let clearTimer: number | undefined;

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

/** Applies a theme while every surface briefly transitions its colors, so the whole page changes together. */
export function applyThemeWithTransition(theme: Theme): void {
  const root = document.documentElement;
  root.setAttribute(SWITCHING_ATTRIBUTE, '');
  applyTheme(theme);

  window.clearTimeout(clearTimer);
  clearTimer = window.setTimeout(() => root.removeAttribute(SWITCHING_ATTRIBUTE), SWITCHING_DURATION_MS);
}
