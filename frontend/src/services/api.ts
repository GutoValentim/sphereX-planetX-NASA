import type { ObservationQuery, SpectralBandId } from '../types/observation';

/**
 * Client of the SPHEREx Node API (which forwards to the scientific Python service).
 * Production builds receive VITE_API_BASE_URL (https://api.spherex.prospectordigital.com.br).
 */
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

export const SPHEREX_BAND_IDS = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'] as const;
const DEFAULT_REFERENCE_BAND = 'D3';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Absolute URL for API paths, including the relative image/chart URLs returned by the API. */
export function apiUrl(path: string): string {
  return /^https?:\/\//.test(path) ? path : `${API_BASE_URL}${path}`;
}

async function requestJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { signal, headers: { Accept: 'application/json' } });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('The SPHEREx service could not be reached. Check your connection and try again.', 0);
  }
  const body = (await response.json().catch(() => ({}))) as { erro?: string } & T;
  if (!response.ok) {
    throw new ApiError(body.erro ?? `Request failed (HTTP ${response.status}).`, response.status);
  }
  return body;
}

/** 'P' (standard) means every band, anchored on D3; a single band anchors the timeline on itself. */
export function referenceBand(band: SpectralBandId): string {
  return (SPHEREX_BAND_IDS as readonly string[]).includes(band) ? band : DEFAULT_REFERENCE_BAND;
}

function consultationPath(query: ObservationQuery, extra: Record<string, string>): string {
  const params = new URLSearchParams({
    RA: String(query.raDeg),
    DEC: String(query.decDeg),
    // The API requires a reference date; without one, today's date is used (it does not filter epochs).
    Data: query.observationDate ?? new Date().toISOString().slice(0, 10),
    bandas: SPHEREX_BAND_IDS.join(','),
    ...extra,
  });
  return `/api/consulta?${params}`;
}

// ---------- Temporal image sequence ----------

export interface SequenceLayer {
  bandpass: string;
  observation_id: string;
  observed_at: string;
  delta_seconds: number;
  image_url: string | null;
  error: string | null;
  width?: number;
  height?: number;
  false_color_rgb?: [number, number, number] | null;
  wavelength_min_um?: number | null;
  wavelength_max_um?: number | null;
}

export interface SequenceFrame {
  id: string;
  observed_at: string;
  anchor_bandpass: string;
  layers: SequenceLayer[];
}

export interface SequenceBandInfo {
  available: boolean;
  observation_count: number;
  error: string | null;
  band: { wavelength_min_um: number; wavelength_max_um: number; display_rgb: [number, number, number] };
}

export interface SequenceSnapshot {
  job_id: string;
  status: 'discovering' | 'rendering' | 'completed' | 'partial' | 'failed';
  anchor_bandpass: string;
  bands: Record<string, SequenceBandInfo>;
  frames: SequenceFrame[];
  progress: { done: number; total: number };
  error: string | null;
}

interface ConsultationResponse {
  sequencia?: { status_url: string; job: SequenceSnapshot };
}

export type ImageColorMode = 'falsa' | 'mono';

export async function startImageSequence(
  query: ObservationQuery,
  signal?: AbortSignal,
  color: ImageColorMode = 'falsa',
) {
  const body = await requestJson<ConsultationResponse>(
    // "balanceada": up to 12 epochs spread over the mission, so the timeline shows real change.
    // "mono" is cached separately from the false-color frames, so switching back does not re-render.
    consultationPath(query, {
      elemento: 'imagem',
      referencia: referenceBand(query.band),
      modo: 'balanceada',
      cor: color,
    }),
    signal,
  );
  if (!body.sequencia) throw new ApiError('The API did not return an image sequence.', 502);
  return body.sequencia;
}

// ---------- Spectrum ----------

export interface SpectrumPoint {
  observation_id: string;
  observed_at: string | null;
  wavelength_um: number;
  bandwidth_um: number;
  flux_mjy: number;
  flux_error_mjy: number;
}

export interface SpectrumBand {
  bandpass: string;
  band: { wavelength_min_um: number; wavelength_max_um: number; display_rgb: [number, number, number] };
  observation_count: number;
  measured_count: number;
  outliers: string[];
  error: string | null;
  points: SpectrumPoint[];
  channels: { wavelength_um: number; flux_mjy: number }[];
}

export interface SpectrumSnapshot {
  job_id: string;
  status: 'running' | 'completed' | 'failed';
  progress: Record<string, { done: number; total: number | null }>;
  result: { combined_chart_url: string; bands: SpectrumBand[] } | null;
  error: string | null;
}

export async function startSpectrum(query: ObservationQuery, signal?: AbortSignal) {
  return requestJson<{ status_url: string; job: SpectrumSnapshot }>(
    consultationPath(query, { elemento: 'espectro' }),
    signal,
  );
}

export function getJob<T>(statusUrl: string, signal?: AbortSignal): Promise<T> {
  return requestJson<T>(statusUrl, signal);
}
