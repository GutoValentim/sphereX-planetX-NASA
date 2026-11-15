import type { SpectralBandOption } from '../types/observation';

/** Default band first, remaining bands in alphabetical order. */
export function orderSpectralBands(
  bands: readonly SpectralBandOption[],
  defaultBandId: string,
): SpectralBandOption[] {
  const defaultBand = bands.filter((band) => band.id === defaultBandId);
  const others = bands
    .filter((band) => band.id !== defaultBandId)
    .sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }));

  return [...defaultBand, ...others];
}
