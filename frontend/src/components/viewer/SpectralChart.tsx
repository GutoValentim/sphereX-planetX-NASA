import { lazy, Suspense, useState } from 'react';
import { ChartIcon } from '../common/icons';
import fieldStyles from '../common/Field.module.css';
import ErrorState from '../common/ErrorState';
import LoadingState from '../common/LoadingState';
import VisualizationPlaceholder from './VisualizationPlaceholder';
import type { ChartDataset } from '../../types/chart';
import styles from './SpectralChart.module.css';

const PlotlyChart = lazy(() => import('../charts/PlotlyChart'));

interface SpectralChartProps {
  /** Selectable charts for the current observation; empty until the backend provides them. */
  datasets: readonly ChartDataset[];
  /** Shown instead of the placeholder while the data is being produced. */
  loadingMessage?: string | null;
  errorMessage?: string | null;
}

/** Lets the user pick which dataset to plot. Plotly is only downloaded once there is data to draw. */
function SpectralChart({ datasets, loadingMessage, errorMessage }: SpectralChartProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = datasets.find((dataset) => dataset.id === selectedId) ?? datasets[0] ?? null;

  return (
    <div className={styles.chart}>
      <div className={styles.controls}>
        <label htmlFor="chart-data-select" className={fieldStyles.label}>
          Displayed data
        </label>
        <select
          id="chart-data-select"
          className={fieldStyles.select}
          value={selected?.id ?? ''}
          onChange={(event) => setSelectedId(event.target.value)}
          disabled={datasets.length === 0}
        >
          {datasets.length === 0 ? (
            <option value="">Not available yet</option>
          ) : (
            datasets.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>
                {dataset.label}
              </option>
            ))
          )}
        </select>
      </div>
      <div className={styles.plotArea}>
        {selected ? (
          <Suspense fallback={<LoadingState message="Loading chart…" />}>
            <PlotlyChart traces={selected.traces} layout={selected.layout} ariaLabel={selected.label} />
          </Suspense>
        ) : errorMessage ? (
          <ErrorState title="Spectrum unavailable" message={errorMessage} />
        ) : loadingMessage ? (
          <LoadingState message={loadingMessage} />
        ) : (
          <VisualizationPlaceholder
            icon={<ChartIcon />}
            title="Chart area"
            description="Plotly charts will show the data provided by the backend for this observation."
          />
        )}
      </div>
    </div>
  );
}

export default SpectralChart;
