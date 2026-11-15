import { useEffect, useRef, useState } from 'react';
import type { Config, Data, Layout } from 'plotly.js';
import ErrorState from '../common/ErrorState';
import LoadingState from '../common/LoadingState';
import { useTheme } from '../../hooks/useTheme';
import { loadPlotly, type PlotlyApi } from '../../integrations/plotly';
import styles from './PlotlyChart.module.css';

type ChartStatus = 'loading' | 'ready' | 'error';

interface PlotlyChartProps {
  traces: Data[];
  layout?: Partial<Layout>;
  /** Accessible name for the plot, e.g. the dataset label. */
  ariaLabel: string;
}

const CONFIG: Partial<Config> = {
  displaylogo: false,
  responsive: true,
  modeBarButtonsToRemove: ['select2d', 'lasso2d'],
};

/** Plotly cannot parse color-mix() or var(), so tokens are resolved to rgb() through a probe element. */
function resolveColorTokens(container: HTMLElement, names: readonly string[]): string[] {
  const probe = document.createElement('span');
  probe.hidden = true;
  container.append(probe);
  const colors = names.map((name) => {
    probe.style.color = `var(${name})`;
    return getComputedStyle(probe).color;
  });
  probe.remove();
  return colors;
}

function readThemeLayout(container: HTMLElement): Partial<Layout> {
  const [text, gridColor, primary, accent] = resolveColorTokens(container, [
    '--color-text',
    '--color-border',
    '--color-primary',
    '--color-accent',
  ]);
  const fontFamily = getComputedStyle(document.documentElement).getPropertyValue('--font-body').trim();

  return {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { family: fontFamily, color: text },
    colorway: [primary, accent],
    xaxis: { gridcolor: gridColor, zerolinecolor: gridColor },
    yaxis: { gridcolor: gridColor, zerolinecolor: gridColor },
    margin: { t: 32, r: 16, b: 48, l: 56 },
  };
}

function mergeLayout(base: Partial<Layout>, layout: Partial<Layout> | undefined): Partial<Layout> {
  if (!layout) return base;
  return {
    ...base,
    ...layout,
    font: { ...base.font, ...layout.font },
    xaxis: { ...base.xaxis, ...layout.xaxis },
    yaxis: { ...base.yaxis, ...layout.yaxis },
  };
}

/** Thin, reusable wrapper around Plotly: lazy-loads the library, follows the app theme and the container size. */
function PlotlyChart({ traces, layout, ariaLabel }: PlotlyChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotlyRef = useRef<PlotlyApi | null>(null);
  const [status, setStatus] = useState<ChartStatus>('loading');
  const [attempt, setAttempt] = useState(0);
  const { theme } = useTheme();

  useEffect(() => {
    let cancelled = false;
    loadPlotly()
      .then((Plotly) => {
        if (cancelled) return;
        plotlyRef.current = Plotly;
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error('[PlotlyChart] Failed to load Plotly', error);
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    const container = containerRef.current;
    const Plotly = plotlyRef.current;
    if (status !== 'ready' || !container || !Plotly) return;
    void Plotly.react(container, traces, mergeLayout(readThemeLayout(container), layout), CONFIG);
  }, [status, traces, layout, theme]);

  useEffect(() => {
    const container = containerRef.current;
    const Plotly = plotlyRef.current;
    if (status !== 'ready' || !container || !Plotly) return;

    // Also covers the chart becoming visible after being hidden (zero-sized) in another view mode.
    const observer = new ResizeObserver(() => {
      if (container.offsetWidth > 0) Plotly.Plots.resize(container);
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      Plotly.purge(container);
    };
  }, [status]);

  return (
    <div className={styles.chart}>
      <div ref={containerRef} className={styles.plot} role="img" aria-label={ariaLabel} />
      {status === 'loading' && (
        <div className={styles.overlay}>
          <LoadingState message="Loading chart…" />
        </div>
      )}
      {status === 'error' && (
        <div className={styles.overlay}>
          <ErrorState
            title="Chart unavailable"
            message="The charting library could not be loaded."
            onRetry={() => {
              setStatus('loading');
              setAttempt((value) => value + 1);
            }}
          />
        </div>
      )}
    </div>
  );
}

export default PlotlyChart;
