import type { Data, Layout } from 'plotly.js';

/** One selectable chart in the viewer. Traces, axes and units are defined by the backend response. */
export interface ChartDataset {
  id: string;
  label: string;
  traces: Data[];
  layout?: Partial<Layout>;
}
