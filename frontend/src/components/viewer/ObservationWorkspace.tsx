import { useMemo, useState } from 'react';
import AladinViewer from './AladinViewer';
import ObservationMetadata from './ObservationMetadata';
import SpectralBandPanel from './SpectralBandPanel';
import SpectralChart from './SpectralChart';
import TimelinePlayer from './TimelinePlayer';
import ViewModeToggle from './ViewModeToggle';
import { SPECTRAL_BANDS } from '../../constants/spectralBands';
import { useBandSelection } from '../../hooks/useBandSelection';
import { useObservationFrames } from '../../hooks/useObservationFrames';
import { useTimeline } from '../../hooks/useTimeline';
import type { ChartDataset } from '../../types/chart';
import type { ObservationQuery } from '../../types/observation';
import type { ViewMode } from '../../types/viewer';
import styles from './ObservationWorkspace.module.css';

const AVAILABLE_BAND_IDS = SPECTRAL_BANDS.map((band) => band.id);
/** Chart series will come from the backend; there is no endpoint for them yet. */
const NO_CHART_DATASETS: readonly ChartDataset[] = [];

interface ObservationWorkspaceProps {
  query: ObservationQuery;
}

function ObservationWorkspace({ query }: ObservationWorkspaceProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('image');
  const { selectedBandIds, toggleBand, selectAll, clearAll } = useBandSelection(AVAILABLE_BAND_IDS);
  const { frames, isDemo } = useObservationFrames();
  const timeline = useTimeline(frames, { preferredDate: query.observationDate });

  const selectedBands = useMemo(
    () => SPECTRAL_BANDS.filter((band) => selectedBandIds.includes(band.id)),
    [selectedBandIds],
  );
  const requestedBandLabel = SPECTRAL_BANDS.find((band) => band.id === query.band)?.label ?? query.band;

  return (
    <div className={styles.workspace}>
      <div className={styles.main}>
        <SpectralBandPanel
          className={styles.bands}
          bands={SPECTRAL_BANDS}
          selectedBandIds={selectedBandIds}
          onToggle={toggleBand}
          onSelectAll={selectAll}
          onClearAll={clearAll}
        />

        {/* Both views stay mounted so switching modes does not recreate the viewer or chart instances. */}
        <div className={styles.stage}>
          <section className={styles.view} hidden={viewMode !== 'image'} aria-label="Sky image">
            <AladinViewer target={query} observation={timeline.activeFrame} isDemoObservation={isDemo} />
          </section>
          <section className={styles.view} hidden={viewMode !== 'chart'} aria-label="Chart">
            <SpectralChart datasets={NO_CHART_DATASETS} />
          </section>
        </div>

        <ViewModeToggle className={styles.mode} value={viewMode} onChange={setViewMode} />

        <TimelinePlayer
          className={styles.timeline}
          frames={timeline.frames}
          activeIndex={timeline.activeIndex}
          isPlaying={timeline.isPlaying}
          canPlay={timeline.canPlay}
          canGoNewer={timeline.canGoNewer}
          canGoOlder={timeline.canGoOlder}
          isDemo={isDemo}
          onSelect={timeline.goTo}
          onNewer={timeline.goToNewer}
          onOlder={timeline.goToOlder}
          onTogglePlay={timeline.togglePlay}
        />
      </div>

      <ObservationMetadata
        query={query}
        requestedBandLabel={requestedBandLabel}
        selectedBands={selectedBands}
        activeObservation={timeline.activeFrame}
        isDemoObservation={isDemo}
      />
    </div>
  );
}

export default ObservationWorkspace;
