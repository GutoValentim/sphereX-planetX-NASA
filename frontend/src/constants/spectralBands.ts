import type { SpectralBandOption } from '../types/observation';

export const DEFAULT_SPECTRAL_BAND = 'P';

/**
 * Project-defined bands available in the exploration form.
 * Add new bands only when confirmed by the team or provided by the backend.
 */
export const SPECTRAL_BANDS: readonly SpectralBandOption[] = [
  { id: DEFAULT_SPECTRAL_BAND, label: 'P (standard) — all bands' },
  { id: 'D1', label: 'D1 — 0.75–1.09 µm' },
  { id: 'D2', label: 'D2 — 1.10–1.62 µm' },
  { id: 'D3', label: 'D3 — 1.63–2.41 µm' },
  { id: 'D4', label: 'D4 — 2.42–3.82 µm' },
  { id: 'D5', label: 'D5 — 3.83–4.41 µm' },
  { id: 'D6', label: 'D6 — 4.42–5.00 µm' },
];
