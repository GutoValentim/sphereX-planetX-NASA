import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AladinViewer from './AladinViewer';
import MonochromePanel from './MonochromePanel';
import ObservationMetadata from './ObservationMetadata';
import SavedImages from './SavedImages';
import SpectralBandPanel from './SpectralBandPanel';
import SpectralChart from './SpectralChart';
import SpherexFrameView from './SpherexFrameView';
import TimelinePlayer from './TimelinePlayer';
import ViewModeToggle from './ViewModeToggle';
import { DEFAULT_SPECTRAL_BAND, SPECTRAL_BANDS } from '../../constants/spectralBands';
import { useBandSelection } from '../../hooks/useBandSelection';
import { useObservationFrames } from '../../hooks/useObservationFrames';
import { useSpectrum } from '../../hooks/useSpectrum';
import { useTimeline } from '../../hooks/useTimeline';
import { ROUTES } from '../../routes/paths';
import type { ObservationQuery } from '../../types/observation';
import type { ViewMode } from '../../types/viewer';
import { toSpectrumDatasets } from '../../utils/apiMapping';
import { rememberImage, type SavedImage } from '../../utils/imageHistory';
import { toQueryParams } from '../../utils/observationQueryParams';
import styles from './ObservationWorkspace.module.css';

/** The viewer shows individual SPHEREx detectors; "P (all bands)" is a form shortcut, not a layer. */
const DISPLAY_BANDS = SPECTRAL_BANDS.filter((band) => band.id !== DEFAULT_SPECTRAL_BAND);
const DISPLAY_BAND_IDS = DISPLAY_BANDS.map((band) => band.id);

type ImageSource = 'spherex' | 'reference';

interface ObservationWorkspaceProps {
  query: ObservationQuery;
}

function ObservationWorkspace({ query }: ObservationWorkspaceProps) {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('image');
  const [imageSource, setImageSource] = useState<ImageSource>('spherex');
  const [monochrome, setMonochrome] = useState(false);
  const [monoRequested, setMonoRequested] = useState(false);
  // Heavy views start on first use and then stay mounted, so switching back is instant.
  const [referenceRequested, setReferenceRequested] = useState(false);
  const [chartRequested, setChartRequested] = useState(false);

  const { selectedBandIds, toggleBand, selectAll, clearAll } = useBandSelection(DISPLAY_BAND_IDS);
  const colorSource = useObservationFrames(query, 'falsa');
  const monoSource = useObservationFrames(query, 'mono', monoRequested);
  const source = monochrome ? monoSource : colorSource;

  useEffect(() => {
    if (colorSource.status === 'ready' && colorSource.frames.some((frame) => frame.layers?.some((layer) => layer.imageUrl))) {
      rememberImage(query);
    }
  }, [colorSource.status, colorSource.frames, query]);
  const timeline = useTimeline(source.frames, { preferredDate: query.observationDate });
  const spectrum = useSpectrum(query, chartRequested);

  const selectedBands = useMemo(
    () => DISPLAY_BANDS.filter((band) => selectedBandIds.includes(band.id)),
    [selectedBandIds],
  );
  const requestedBandLabel = SPECTRAL_BANDS.find((band) => band.id === query.band)?.label ?? query.band;
  const chartDatasets = useMemo(
    () => toSpectrumDatasets(spectrum.snapshot?.result?.bands ?? [], selectedBandIds),
    [spectrum.snapshot, selectedBandIds],
  );

  const changeViewMode = (mode: ViewMode) => {
    if (mode === 'chart') setChartRequested(true);
    setViewMode(mode);
  };
  const changeImageSource = (next: ImageSource) => {
    if (next === 'reference') setReferenceRequested(true);
    setImageSource(next);
  };
  const openSavedImage = (image: SavedImage) => {
    const params = toQueryParams(image);
    navigate({ pathname: ROUTES.viewer, search: `?${params}` });
  };

  const spectrumProgress = spectrum.progress.total
    ? ` (${spectrum.progress.done}/${spectrum.progress.total} observations)`
    : '';
  const spectrumLoading =
    spectrum.status === 'loading'
      ? `Measuring the target in every SPHEREx observation${spectrumProgress}… a new coordinate takes 1–2 minutes.`
      : null;

  return (
    <div className={styles.workspace}>
      <div className={styles.main}>
        <div className={styles.bands}>
          <SpectralBandPanel
            bands={DISPLAY_BANDS}
            selectedBandIds={selectedBandIds}
            onToggle={toggleBand}
            onSelectAll={selectAll}
            onClearAll={clearAll}
          />
          <MonochromePanel
            enabled={monochrome}
            onChange={(enabled) => {
              setMonochrome(enabled);
              if (enabled) setMonoRequested(true);
            }}
          />
        </div>

        {/* Both views stay mounted so switching modes does not recreate the viewer or chart instances. */}
        <div className={styles.stage}>
          <section className={styles.view} hidden={viewMode !== 'image'} aria-label="Sky image">
            <div className={styles.sourceToggle} role="group" aria-label="Image source">
              <button
                type="button"
                aria-pressed={imageSource === 'spherex'}
                onClick={() => changeImageSource('spherex')}
              >
                SPHEREx
              </button>
              <button
                type="button"
                aria-pressed={imageSource === 'reference'}
                onClick={() => changeImageSource('reference')}
              >
                Reference sky (DSS2)
              </button>
              <SavedImages onOpen={openSavedImage} />
            </div>
            <div className={styles.sourceView} hidden={imageSource !== 'spherex'}>
              <SpherexFrameView
                frame={timeline.activeFrame}
                selectedBandIds={selectedBandIds}
                status={source.status ?? 'loading'}
                error={source.error}
                progress={source.progress}
              />
            </div>
            {referenceRequested && (
              <div className={styles.sourceView} hidden={imageSource !== 'reference'}>
                <AladinViewer target={query} observation={timeline.activeFrame} isDemoObservation={false} />
              </div>
            )}
          </section>
          <section className={styles.view} hidden={viewMode !== 'chart'} aria-label="Chart">
            <SpectralChart
              datasets={chartDatasets}
              loadingMessage={spectrumLoading}
              errorMessage={spectrum.status === 'error' ? spectrum.error : null}
            />
          </section>
        </div>

        <ViewModeToggle className={styles.mode} value={viewMode} onChange={changeViewMode} />

        <TimelinePlayer
          className={styles.timeline}
          frames={timeline.frames}
          activeIndex={timeline.activeIndex}
          isPlaying={timeline.isPlaying}
          canPlay={timeline.canPlay}
          canGoNewer={timeline.canGoNewer}
          canGoOlder={timeline.canGoOlder}
          isDemo={false}
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
        isDemoObservation={false}
      />
    </div>
  );
}

export default ObservationWorkspace;
