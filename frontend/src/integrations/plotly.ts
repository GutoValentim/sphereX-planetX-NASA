import type Plotly from 'plotly.js';

export type PlotlyApi = typeof Plotly;

let plotlyPromise: Promise<PlotlyApi> | null = null;

/**
 * Loads the prebuilt "basic" Plotly bundle (scatter, bar and pie traces) on first use.
 * Switch to another bundle in plotly.js/dist if the backend requires other trace types.
 */
export function loadPlotly(): Promise<PlotlyApi> {
  if (!plotlyPromise) {
    plotlyPromise = import('plotly.js/dist/plotly-basic.min.js')
      .then((module) => module.default)
      .catch((error: unknown) => {
        plotlyPromise = null;
        throw error;
      });
  }
  return plotlyPromise;
}
