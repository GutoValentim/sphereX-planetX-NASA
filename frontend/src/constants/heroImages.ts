import type { Theme } from '../types/theme';

/**
 * Hero photographs are picked up automatically from src/assets/hero/ when named
 * hero-light.<ext> and hero-dark.<ext> (jpg, jpeg, png, webp or avif).
 * A missing file keeps the CSS gradient background for that theme.
 */
const heroFiles = import.meta.glob<string>('../assets/hero/hero-{light,dark}.{jpg,jpeg,png,webp,avif}', {
  eager: true,
  query: '?url',
  import: 'default',
});

function findHeroImage(theme: Theme): string | null {
  const match = Object.entries(heroFiles).find(([path]) => path.includes(`/hero-${theme}.`));
  return match ? match[1] : null;
}

export const HERO_IMAGES: Readonly<Record<Theme, string | null>> = {
  light: findHeroImage('light'),
  dark: findHeroImage('dark'),
};
