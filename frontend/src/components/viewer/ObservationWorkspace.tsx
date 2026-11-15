import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AladinViewer from './AladinViewer';
import ImageSourceToggle, { type ImageSource } from './ImageSourceToggle';
import MappedTargetsPanel from './MappedTargetsPanel';
import MonochromePanel from './MonochromePanel';
import ObservationMetadata from './ObservationMetadata';
import SavedImages from './SavedImages';
import SpectralBandPanel from './SpectralBandPanel';
import SpectralChart from './SpectralChart';
import SpectrumGallery from './SpectrumGallery';
import SpherexFrameView from './SpherexFrameView';
import TimelinePlayer from './TimelinePlayer';
import ViewModeToggle from './ViewModeToggle';
import { DEFAULT_SPECTRAL_BAND, SPECTRAL_BANDS } from '../../constants/spectralBands';
import { UI_FEATURES } from '../../constants/uiFeatures';
import { useBandSelection } from '../../hooks/useBandSelection';
import { useCatalogManifest } from '../../hooks/useCatalog';
import { useObservationFrames } from '../../hooks/useObservationFrames';
import { useSpectrum } from '../../hooks/useSpectrum';
import { useTheme } from '../../hooks/useTheme';
import { useTimeline } from '../../hooks/useTimeline';
import { ROUTES } from '../../routes/paths';
import { CATALOG_ENABLED } from '../../services/catalog';
import type { ObservationFrameSource, ObservationQuery } from '../../types/observation';
import type { ViewMode } from '../../types/viewer';
import { toSpectrumDatasets } from '../../utils/apiMapping';
import { galleryFromLiveSpectrum, galleryFromManifest, manifestFrames } from '../../utils/catalogMapping';
import { rememberImage, type SavedImage } from '../../utils/imageHistory';
import { toQueryParams } from '../../utils/observationQueryParams';
import styles from './ObservationWorkspace.module.css';

/** The viewer shows individual SPHEREx detectors; "P (all bands)" is a form shortcut, not a layer. */
const DISPLAY_BANDS = SPECTRAL_BANDS.filter((band) => band.id !== DEFAULT_SPECTRAL_BAND);
const DISPLAY_BAND_IDS = DISPLAY_BANDS.map((band) => band.id);

type SideTab = 'bands' | 'targets';

const SHOW_TARGETS_TAB = UI_FEATURES.viewerTargetsTab && CATALOG_ENABLED;

interface ObservationWorkspaceProps {
  query: ObservationQuery;
  /** Slug of a target mapped by the lab: images and spectrum come from its export, not a live job. */
  targetSlug?: string | null;
}

function ObservationWorkspace({ query, targetSlug = null }: ObservationWorkspaceProps) {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isTarget = Boolean(targetSlug);
  const [sideTab, setSideTab] = useState<SideTab>('bands');
  const [viewMode, setViewMode] = useState<ViewMode>('image');
  const [imageSource, setImageSource] = useState<ImageSource>('spherex');
  const [monochrome, setMonochrome] = useState(false);
  const [monoRequested, setMonoRequested] = useState(false);
  // Heavy views start on first use and then stay mounted, so switching back is instant.
  const [referenceRequested, setReferenceRequested] = useState(false);
  const [chartRequested, setChartRequested] = useState(false);
  // "Try again" after an archive error restarts the live jobs.
  const [imageAttempt, setImageAttempt] = useState(0);
  const [spectrumAttempt, setSpectrumAttempt] = useState(0);

  const { selectedBandIds, toggleBand, selectAll, clearAll } = useBandSelection(DISPLAY_BAND_IDS);
  const target = useCatalogManifest(targetSlug);
  // A partially mapped target may lack images or spectrum: those parts fall back to a live query.
  const targetLoading = isTarget && target.status === 'loading';
  const imagesFromTarget = targetLoading || (target.manifest?.sequences.length ?? 0) > 0;
  const spectrumFromTarget =
    targetLoading || Boolean(target.manifest && galleryFromManifest(target.manifest, theme));
  const colorSource = useObservationFrames(query, 'falsa', !imagesFromTarget, imageAttempt);
  const monoSource = useObservationFrames(query, 'mono', monoRequested && !imagesFromTarget, imageAttempt);
  const targetSource = useMemo<ObservationFrameSource>(() => {
    if (!target.manifest) return { frames: [], isDemo: false, status: 'loading' };
    return { frames: manifestFrames(target.manifest, monochrome ? 'mono' : 'color'), isDemo: false, status: 'ready' };
  }, [target, monochrome]);
  const source = imagesFromTarget ? targetSource : monochrome ? monoSource : colorSource;

  useEffect(() => {
    if (imagesFromTarget) return;
    if (colorSource.status === 'ready' && colorSource.frames.some((frame) => frame.layers?.some((layer) => layer.imageUrl))) {
      rememberImage(query);
    }
  }, [imagesFromTarget, colorSource.status, colorSource.frames, query]);
  const timeline = useTimeline(source.frames, { preferredDate: query.observationDate });
  const spectrum = useSpectrum(query, chartRequested && !spectrumFromTarget, theme, spectrumAttempt);
  const spectrumGallery = useMemo(() => {
    if (spectrumFromTarget) return target.manifest ? galleryFromManifest(target.manifest, theme) : null;
    return spectrum.snapshot?.result ? galleryFromLiveSpectrum(spectrum.snapshot.result) : null;
  }, [spectrumFromTarget, target.manifest, theme, spectrum.snapshot]);
  const spectrumError = !spectrumFromTarget && spectrum.status === 'error' ? spectrum.error : null;

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

  const spectrumLoading = spectrumFromTarget
    ? 'Loading the mapped spectrum…'
    : spectrum.status === 'loading'
      ? 'Measuring the target in every SPHEREx observation…'
      : null;

  // While a live job renders, each band is usable only once all its epochs are ready.
  const liveRendering = !imagesFromTarget && (source.status === 'loading' || source.status === 'rendering');
  const bandProgress = useMemo(() => {
    if (!liveRendering) return undefined;
    const progress: Record<string, { done: number; total: number }> = {};
    for (const band of DISPLAY_BANDS) progress[band.id] = { done: 0, total: 0 };
    for (const frame of source.frames) {
      for (const layer of frame.layers ?? []) {
        const entry = progress[layer.bandId];
        if (!entry) continue;
        entry.total += 1;
        if (layer.imageUrl || layer.error) entry.done += 1;
      }
    }
    return progress;
  }, [liveRendering, source.frames]);

  // Layout: square SPHEREx image, wide reference sky, or the full-width spectrum.
  const layout = viewMode === 'chart' ? 'chart' : imageSource === 'reference' ? 'reference' : 'spherex';

  const bandControls = (
    <>
      <SpectralBandPanel
        bands={DISPLAY_BANDS}
        selectedBandIds={selectedBandIds}
        onToggle={toggleBand}
        onSelectAll={selectAll}
        onClearAll={clearAll}
        bandProgress={bandProgress}
      />
      <MonochromePanel
        enabled={monochrome}
        onChange={(enabled) => {
          setMonochrome(enabled);
          if (enabled) setMonoRequested(true);
        }}
      />
    </>
  );

  return (
    <div className={styles.workspace}>
      <div className={styles.main} data-layout={layout} data-frame={UI_FEATURES.viewerWideFrame ? 'wide' : 'square'}>
        <div className={styles.bands} hidden={layout !== 'spherex'}>
          {SHOW_TARGETS_TAB ? (
            <>
              <div className={styles.sideTabs} role="tablist" aria-label="Side panel">
                <button
                  type="button"
                  role="tab"
                  id="side-tab-bands"
                  aria-selected={sideTab === 'bands'}
                  aria-controls="side-panel-bands"
                  onClick={() => setSideTab('bands')}
                >
                  Bands
                </button>
                <button
                  type="button"
                  role="tab"
                  id="side-tab-targets"
                  aria-selected={sideTab === 'targets'}
                  aria-controls="side-panel-targets"
                  onClick={() => setSideTab('targets')}
                >
                  Mapped targets
                </button>
              </div>
              <div
                className={styles.sidePanel}
                role="tabpanel"
                id="side-panel-bands"
                aria-labelledby="side-tab-bands"
                hidden={sideTab !== 'bands'}
              >
                {bandControls}
              </div>
              <div
                className={styles.sidePanel}
                role="tabpanel"
                id="side-panel-targets"
                aria-labelledby="side-tab-targets"
                hidden={sideTab !== 'targets'}
              >
                <MappedTargetsPanel activeSlug={targetSlug} />
              </div>
            </>
          ) : (
            bandControls
          )}
        </div>

        {/* Both views stay mounted so switching modes does not recreate the viewer or chart instances. */}
        <div className={styles.stage}>
          <section className={styles.view} hidden={viewMode !== 'image'} aria-label="Sky image">
            <div className={styles.sourceView} hidden={imageSource !== 'spherex'}>
              <SpherexFrameView
                frame={timeline.activeFrame}
                selectedBandIds={selectedBandIds}
                status={source.status ?? 'loading'}
                error={source.error}
                progress={source.progress}
                onRetry={() => setImageAttempt((value) => value + 1)}
                fit={UI_FEATURES.viewerWideFrame ? 'cover' : 'contain'}
              />
            </div>
            {referenceRequested && (
              <div className={styles.sourceView} hidden={imageSource !== 'reference'}>
                <AladinViewer target={query} observation={null} isDemoObservation={false} />
              </div>
            )}
          </section>
          <section className={styles.view} hidden={viewMode !== 'chart'} aria-label="Chart">
            {UI_FEATURES.spectrumGallery ? (
              <SpectrumGallery
                data={spectrumGallery}
                loadingMessage={spectrumLoading}
                errorMessage={spectrumError}
                progress={spectrumFromTarget ? undefined : spectrum.progress}
                onRetry={() => setSpectrumAttempt((value) => value + 1)}
              />
            ) : (
              <SpectralChart datasets={chartDatasets} loadingMessage={spectrumLoading} errorMessage={spectrumError} />
            )}
          </section>
        </div>

        {/* Right rail: view mode, then (for images) the image source and saved images. */}
        <div className={styles.mode}>
          <ViewModeToggle value={viewMode} onChange={changeViewMode} />
          {viewMode === 'image' && <ImageSourceToggle value={imageSource} onChange={changeImageSource} />}
          {viewMode === 'image' && <SavedImages onOpen={openSavedImage} variant="rail" />}
        </div>

        <div className={styles.timeline} hidden={layout !== 'spherex'}>
          <TimelinePlayer
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
