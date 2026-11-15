import { apiUrl, type SpectrumBand } from '../services/api';
import { catalogFileUrl, type CatalogManifest, type CatalogSequence } from '../services/catalog';
import type { ObservationFrame } from '../types/observation';
import { shortBandId, utcIso } from './apiMapping';

/** Same render profile and window as the live API defaults (perfil "limpa", 30′ native). */
const PREFERRED_PROFILE = 'limpa';
const PREFERRED_FOV = 30;

export type CatalogColorMode = 'color' | 'mono';

function pickSequence(manifest: CatalogManifest, colorMode: CatalogColorMode): CatalogSequence | null {
  const candidates = manifest.sequences.filter((sequence) => sequence.color_mode === colorMode);
  const score = (sequence: CatalogSequence) =>
    (sequence.render_profile === PREFERRED_PROFILE ? 4 : 0) +
    (sequence.fov_arcmin === PREFERRED_FOV ? 2 : 0) +
    (sequence.sampling === 'native' ? 1 : 0);
  return [...candidates].sort((a, b) => score(b) - score(a))[0] ?? manifest.sequences[0] ?? null;
}

/** The exported sequence in the same shape the live API produces, with absolute image URLs. */
export function manifestFrames(manifest: CatalogManifest, colorMode: CatalogColorMode): ObservationFrame[] {
  const sequence = pickSequence(manifest, colorMode);
  if (!sequence) return [];
  return sequence.frames.map((frame) => ({
    id: frame.id,
    observedAt: utcIso(frame.observed_at),
    referenceBandId: shortBandId(frame.anchor_bandpass),
    layers: frame.layers.map((layer) => ({
      bandId: shortBandId(layer.bandpass),
      observationId: layer.observation_id,
      observedAt: utcIso(layer.observed_at),
      deltaSeconds: layer.delta_seconds,
      imageUrl: layer.image_url ? catalogFileUrl(manifest.slug, layer.image_url) : null,
      error: layer.error,
      color: layer.false_color_rgb ?? null,
      wavelengthRangeUm:
        layer.wavelength_min_um != null && layer.wavelength_max_um != null
          ? [layer.wavelength_min_um, layer.wavelength_max_um]
          : null,
    })),
  }));
}

// ---------- Spectrum charts (rendered SVGs) ----------

export interface SpectrumChartImage {
  bandId: string;
  url: string;
  caption: string;
}

export interface SpectrumGalleryData {
  combinedUrl: string | null;
  bands: SpectrumChartImage[];
}

function bandCaption(band: SpectrumBand): string {
  const { wavelength_min_um: min, wavelength_max_um: max } = band.band;
  const measured = `${band.measured_count}/${band.observation_count} observations measured`;
  return `${shortBandId(band.bandpass)} · ${min.toFixed(2)}–${max.toFixed(2)} µm · ${measured}`;
}

function toGallery(
  combined: string | null | undefined,
  bands: readonly SpectrumBand[],
  resolve: (path: string) => string,
): SpectrumGalleryData {
  return {
    combinedUrl: combined ? resolve(combined) : null,
    bands: bands
      .filter((band) => band.chart_url)
      .map((band) => ({ bandId: shortBandId(band.bandpass), url: resolve(band.chart_url as string), caption: bandCaption(band) })),
  };
}

/** Charts of a live spectrum job (URLs relative to the API). */
export function galleryFromLiveSpectrum(result: { combined_chart_url: string; bands: SpectrumBand[] }): SpectrumGalleryData {
  return toGallery(result.combined_chart_url, result.bands, apiUrl);
}

/** Charts exported by the lab for one theme; falls back to the other theme when missing. */
export function galleryFromManifest(manifest: CatalogManifest, theme: 'dark' | 'light'): SpectrumGalleryData | null {
  const spectrum = manifest.spectrum[theme] ?? manifest.spectrum[theme === 'dark' ? 'light' : 'dark'];
  if (!spectrum) return null;
  return toGallery(spectrum.combined_chart_url, spectrum.bands, (path) => catalogFileUrl(manifest.slug, path));
}
