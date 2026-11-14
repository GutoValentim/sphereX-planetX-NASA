import type { EquatorialCoordinates } from './coordinates';

export type SpectralBandId = string;

export interface SpectralBandOption {
  id: SpectralBandId;
  label: string;
}

/** One observation in the temporal sequence. Extend with the fields defined by the backend contract. */
export interface ObservationFrame {
  id: string;
  /** ISO 8601 timestamp in UTC. */
  observedAt: string;
}

export interface ObservationFrameSource {
  frames: readonly ObservationFrame[];
  /** True when frames are development placeholders that must never be presented as real observations. */
  isDemo: boolean;
}

/** Parameters of a sky exploration request, independent of transport (URL or HTTP). */
export interface ObservationQuery extends EquatorialCoordinates {
  /** ISO date (YYYY-MM-DD), or null to request the latest available observation. */
  observationDate: string | null;
  band: SpectralBandId;
}
