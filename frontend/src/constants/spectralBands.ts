import type { SpectralBandOption } from '../types/observation';

export const DEFAULT_SPECTRAL_BAND = 'P';

/**
 * Project-defined bands available in the exploration form.
 * Add new bands only when confirmed by the team or provided by the backend.
 */
export const SPECTRAL_BANDS: readonly SpectralBandOption[] = [{ id: DEFAULT_SPECTRAL_BAND, label: 'P (standard)' }];
