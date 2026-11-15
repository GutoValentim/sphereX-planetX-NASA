import type { Data, Layout } from 'plotly.js';
import type { SequenceFrame, SequenceSnapshot, SpectrumBand } from '../services/api';
import { apiUrl } from '../services/api';
import type { ChartDataset } from '../types/chart';
import type { ObservationFrame } from '../types/observation';

/** The API returns UTC timestamps without a zone designator; make them explicit for Date.parse. */
export function utcIso(value: string): string {
  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`;
}

export function shortBandId(bandpass: string): string {
  return bandpass.replace('SPHEREx-', '');
}

function bandColor(snapshot: SequenceSnapshot, bandpass: string): [number, number, number] | null {
  return snapshot.bands[bandpass]?.band.display_rgb ?? null;
}

export function toObservationFrames(snapshot: SequenceSnapshot): ObservationFrame[] {
  return snapshot.frames.map((frame: SequenceFrame) => ({
    id: frame.id,
    observedAt: utcIso(frame.observed_at),
    referenceBandId: shortBandId(frame.anchor_bandpass),
    layers: frame.layers.map((layer) => ({
      bandId: shortBandId(layer.bandpass),
      observationId: layer.observation_id,
      observedAt: utcIso(layer.observed_at),
      deltaSeconds: layer.delta_seconds,
      imageUrl: layer.image_url ? apiUrl(layer.image_url) : null,
      error: layer.error,
      color: layer.false_color_rgb ?? bandColor(snapshot, layer.bandpass),
      wavelengthRangeUm:
        layer.wavelength_min_um != null && layer.wavelength_max_um != null
          ? [layer.wavelength_min_um, layer.wavelength_max_um]
          : null,
    })),
  }));
}

function rgb([r, g, b]: [number, number, number], alpha = 1): string {
  return alpha === 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

function bandLabel(band: SpectrumBand): string {
  const { wavelength_min_um: min, wavelength_max_um: max } = band.band;
  return `${shortBandId(band.bandpass)} · ${min.toFixed(3)}–${max.toFixed(3)} µm`;
}

function bandTraces(band: SpectrumBand): Data[] {
  const color = band.band.display_rgb;
  const outliers = new Set(band.outliers);
  const kept = band.points.filter((point) => !outliers.has(point.observation_id));
  const flagged = band.points.filter((point) => outliers.has(point.observation_id));
  const label = bandLabel(band);
  const traces: Data[] = [
    {
      type: 'scatter',
      mode: 'markers',
      name: label,
      legendgroup: band.bandpass,
      x: kept.map((point) => point.wavelength_um),
      y: kept.map((point) => point.flux_mjy),
      error_y: { type: 'data', array: kept.map((point) => point.flux_error_mjy), color: rgb(color, 0.35), thickness: 1 },
      marker: { color: rgb(color, 0.6), size: 5 },
      customdata: kept.map((point) => [point.observation_id, point.observed_at ?? '']),
      hovertemplate: '%{x:.4f} µm<br>%{y:.3f} ± %{error_y.array:.3f} mJy<br>%{customdata[0]}<extra></extra>',
    },
    {
      type: 'scatter',
      mode: 'lines',
      name: `${shortBandId(band.bandpass)} · channel median`,
      legendgroup: band.bandpass,
      showlegend: false,
      x: band.channels.map((channel) => channel.wavelength_um),
      y: band.channels.map((channel) => channel.flux_mjy),
      line: { color: rgb(color), width: 2 },
      hoverinfo: 'skip',
    },
  ];
  if (flagged.length) {
    traces.push({
      type: 'scatter',
      mode: 'markers',
      name: `${shortBandId(band.bandpass)} · outliers`,
      legendgroup: band.bandpass,
      showlegend: false,
      x: flagged.map((point) => point.wavelength_um),
      y: flagged.map((point) => point.flux_mjy),
      marker: { color: 'rgba(0,0,0,0)', size: 6, line: { color: rgb(color, 0.7), width: 1 } },
      hovertemplate: 'Outlier · %{x:.4f} µm<br>%{y:.3f} mJy<extra></extra>',
    });
  }
  return traces;
}

const SPECTRUM_LAYOUT: Partial<Layout> = {
  xaxis: { title: { text: 'Wavelength (µm)' } },
  yaxis: { title: { text: 'Flux density (mJy)' } },
  legend: { orientation: 'h', y: -0.2 },
  hovermode: 'closest',
};

/**
 * One overlay chart with the selected bands plus one chart per band. Colors are the bands'
 * false-color display colors, so chart and image read the same way.
 */
export function toSpectrumDatasets(bands: readonly SpectrumBand[], selectedBandIds: readonly string[]): ChartDataset[] {
  const measured = bands.filter((band) => band.points.length > 0);
  const selected = measured.filter((band) => selectedBandIds.includes(shortBandId(band.bandpass)));
  const datasets: ChartDataset[] = [];
  if (selected.length) {
    datasets.push({
      id: 'spectrum-overlay',
      label: `Spectrum · ${selected.map((band) => shortBandId(band.bandpass)).join(' + ')}`,
      traces: selected.flatMap(bandTraces),
      layout: SPECTRUM_LAYOUT,
    });
  }
  for (const band of measured) {
    datasets.push({
      id: `spectrum-${band.bandpass}`,
      label: `Spectrum · ${bandLabel(band)} · ${band.measured_count}/${band.observation_count} observations`,
      traces: bandTraces(band),
      layout: SPECTRUM_LAYOUT,
    });
  }
  return datasets;
}
