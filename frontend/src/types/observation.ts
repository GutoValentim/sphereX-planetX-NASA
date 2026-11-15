import type { EquatorialCoordinates } from './coordinates';

export type SpectralBandId = string;

export interface SpectralBandOption {
  id: SpectralBandId;
  label: string;
}

/** One SPHEREx band image of an epoch, aligned to a common sky grid (north up, target centered). */
export interface FrameLayer {
  /** Short band id: D1–D6. */
  bandId: SpectralBandId;
  observationId: string;
  /** ISO 8601 timestamp in UTC. */
  observedAt: string;
  /** Time offset from the epoch's reference band, in seconds. */
  deltaSeconds: number;
  /** null while the image is still being generated. */
  imageUrl: string | null;
  error: string | null;
  /** Display color of the band's false-color rendering (same as the spectrum chart). */
  color: [number, number, number] | null;
  wavelengthRangeUm: [number, number] | null;
}

/** One observation in the temporal sequence. */
export interface ObservationFrame {
  id: string;
  /** ISO 8601 timestamp in UTC. */
  observedAt: string;
  /** Band that defines the epochs of the timeline. */
  referenceBandId?: SpectralBandId;
  layers?: readonly FrameLayer[];
}

export type ObservationLoadStatus = 'loading' | 'rendering' | 'ready' | 'error';

export interface ObservationFrameSource {
  frames: readonly ObservationFrame[];
  /** True when frames are development placeholders that must never be presented as real observations. */
  isDemo: boolean;
  status?: ObservationLoadStatus;
  error?: string | null;
  /** Rendered layers / total layers. */
  progress?: { done: number; total: number };
}

/** Parameters of a sky exploration request, independent of transport (URL or HTTP). */
export interface ObservationQuery extends EquatorialCoordinates {
  /** ISO date (YYYY-MM-DD), or null to request the latest available observation. */
  observationDate: string | null;
  band: SpectralBandId;
}
