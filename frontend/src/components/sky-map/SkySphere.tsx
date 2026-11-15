import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Button from '../common/Button';
import { buttonClassName } from '../common/buttonClassName';
import ErrorState from '../common/ErrorState';
import LoadingState from '../common/LoadingState';
import { DEFAULT_SPECTRAL_BAND, SPECTRAL_BANDS } from '../../constants/spectralBands';
import { UI_FEATURES } from '../../constants/uiFeatures';
import type { CatalogEntry } from '../../services/catalog';
import { formatDegrees, formatRaHms, raDegreesToHms } from '../../utils/coordinateConversion';
import { equatorialToWorldDirection } from '../../utils/galacticCoordinates';
import SkyDust from './SkyDust';
import SkyTargetList from './SkyTargetList';
import SkyTargetMarkers, { type TargetOpenRequest } from './SkyTargetMarkers';
import { SkySphereRenderer, type SkyFrame, type SkySelection } from './skySphereRenderer';
import styles from './SkySphere.module.css';

/** Where a target lands after "fly to": a little above and left of the center. */
const FLY_TO_OFFSET = { x: -0.12, y: -0.1 };
const FLY_TO_FOV_DEG = 30;

const SKY_MAPS = {
  gas: { url: '/sky/spherex-allsky.jpg', label: 'Gas and dust' },
  stars: { url: '/sky/starlight-allsky.jpg', label: 'Stars' },
} as const;

type SkyMapId = keyof typeof SKY_MAPS;

interface SkySphereProps {
  onOpenViewer: (selection: SkySelection) => void;
  isOpeningViewer?: boolean;
  /** Targets already mapped by the lab, drawn on the sphere. */
  targets?: readonly CatalogEntry[];
  onOpenTarget?: (entry: CatalogEntry) => void;
}

function formatSigned(value: number, digits: number): string {
  return formatDegrees(value, digits, true);
}

function paintFrame(
  frame: SkyFrame,
  marker: HTMLElement,
  box: HTMLElement | null,
  centerReadout: HTMLElement | null,
  fovReadout: HTMLElement | null,
  controls: HTMLElement | null,
) {
  if (centerReadout) {
    centerReadout.textContent = `lon ${formatDegrees(frame.galacticLongitude, 2)}  lat ${formatSigned(frame.galacticLatitude, 2)}  FOV ${frame.fovDeg.toFixed(0)}°`;
  }
  if (fovReadout) fovReadout.textContent = `${frame.fovDeg.toFixed(1)}°`;

  if (!frame.marker) {
    marker.hidden = true;
    return;
  }

  marker.hidden = !frame.marker.visible;
  marker.style.transform = `translate(${frame.marker.x}px, ${frame.marker.y}px)`;
  if (!box) return;

  const width = marker.parentElement?.clientWidth ?? 0;
  const height = marker.parentElement?.clientHeight ?? 0;
  const margin = 12;
  const reservedBottom = (controls?.offsetHeight ?? 0) + margin;
  const boxWidth = box.offsetWidth;
  const boxHeight = box.offsetHeight;
  const preferredLeft = frame.marker.visible
    ? frame.marker.x + 30 + boxWidth + margin > width
      ? frame.marker.x - 30 - boxWidth
      : frame.marker.x + 30
    : width - boxWidth - margin;
  const preferredTop = frame.marker.visible ? frame.marker.y - boxHeight / 2 : margin;
  const left = Math.max(margin, Math.min(width - boxWidth - margin, preferredLeft));
  const top = Math.max(margin, Math.min(height - boxHeight - reservedBottom, preferredTop));
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
}

/** All-sky map viewed from the center of a sphere. A click selects ICRS coordinates. */
function SkySphere({ onOpenViewer, isOpeningViewer = false, targets = [], onOpenTarget }: SkySphereProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLElement>(null);
  const centerRef = useRef<HTMLSpanElement>(null);
  const fovRef = useRef<HTMLElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<SkySphereRenderer | null>(null);
  const mapIdRef = useRef<SkyMapId>('gas');
  const gridRef = useRef(false);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'unsupported'>('loading');
  const [mapId, setMapId] = useState<SkyMapId>('gas');
  const [gridOn, setGridOn] = useState(false);
  mapIdRef.current = mapId;
  gridRef.current = gridOn;
  const [selection, setSelection] = useState<SkySelection | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [openRequest, setOpenRequest] = useState<TargetOpenRequest | null>(null);

  // Overlays (dust, target markers) follow the camera through this listener set.
  const frameListeners = useRef(new Set<(frame: SkyFrame) => void>());
  const subscribeFrame = useCallback((listener: (frame: SkyFrame) => void) => {
    frameListeners.current.add(listener);
    return () => {
      frameListeners.current.delete(listener);
    };
  }, []);

  const flyToTarget = useCallback((entry: CatalogEntry) => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.flyTo(equatorialToWorldDirection(entry.ra_deg, entry.dec_deg), {
      offset: FLY_TO_OFFSET,
      fovDeg: FLY_TO_FOV_DEG,
      onDone: () => setOpenRequest((previous) => ({ id: entry.id, nonce: (previous?.nonce ?? 0) + 1 })),
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const marker = markerRef.current;
    if (!canvas || !marker) return undefined;

    let renderer: SkySphereRenderer;
    try {
      renderer = new SkySphereRenderer(canvas, {
        onSelect: setSelection,
        onReady: () => setStatus('ready'),
        onError: () => setStatus('error'),
        onFrame: (frame) => {
          const mark = markerRef.current;
          if (!mark) return;
          paintFrame(frame, mark, boxRef.current, centerRef.current, fovRef.current, controlsRef.current);
          frameListeners.current.forEach((listener) => listener(frame));
        },
      });
    } catch (error) {
      console.error('[SkySphere] WebGL unavailable', error);
      setStatus('unsupported');
      return undefined;
    }

    rendererRef.current = renderer;
    renderer.setGrid(gridRef.current);
    renderer.load(SKY_MAPS[mapIdRef.current].url);
    const observer = new ResizeObserver(() => renderer.resize());
    if (stageRef.current) observer.observe(stageRef.current);

    return () => {
      observer.disconnect();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [attempt]);

  useLayoutEffect(() => {
    if (status === 'ready') rendererRef.current?.renderNow();
  }, [status, selection]);

  const bandLabel = SPECTRAL_BANDS.find((band) => band.id === DEFAULT_SPECTRAL_BAND)?.label ?? DEFAULT_SPECTRAL_BAND;
  const setMarker = useCallback((node: HTMLDivElement | null) => {
    markerRef.current = node;
    if (node) node.hidden = true;
  }, []);

  return (
    <div ref={stageRef} className={styles.stage}>
      <canvas
        ref={canvasRef}
        className={UI_FEATURES.skyBackgroundBlur ? `${styles.canvas} ${styles.canvasSoft}` : styles.canvas}
        tabIndex={0}
        aria-label="All-sky sphere. Drag to look around, click to select a point. Arrow keys pan, plus and minus zoom."
      />
      {UI_FEATURES.skyDust && status === 'ready' && (
        <SkyDust subscribeFrame={subscribeFrame} inertia={UI_FEATURES.skyDustInertia} />
      )}
      <div className={styles.crosshair} aria-hidden="true" />
      {UI_FEATURES.skyTargetMarkers && status === 'ready' && onOpenTarget && targets.length > 0 && (
        <SkyTargetMarkers
          targets={targets}
          rendererRef={rendererRef}
          subscribeFrame={subscribeFrame}
          openRequest={openRequest}
          onOpenTarget={onOpenTarget}
        />
      )}
      <div ref={setMarker} className={styles.marker}>
        <svg viewBox="-22 -22 44 44" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle r="12" />
          <circle r="2" fill="currentColor" stroke="none" />
          <path d="M0 -21V-15M0 15V21M-21 0H-15M15 0H21" strokeLinecap="round" />
        </svg>
      </div>

      {selection && (
        <section ref={boxRef} className={styles.box} aria-live="polite">
          <header className={styles.boxHeader}>
            <p className={styles.boxTitle}>Selected point</p>
            <Button variant="ghost" size="sm" onClick={() => rendererRef.current?.clearSelection()}>
              Clear
            </Button>
          </header>
          <dl className={styles.coords}>
            <dt>RA</dt>
            <dd>
              <span className="text-data">{formatDegrees(selection.raDeg, 5)}</span>
              <small>{formatRaHms(raDegreesToHms(selection.raDeg))}</small>
            </dd>
            <dt>Dec</dt>
            <dd>
              <span className="text-data">{formatSigned(selection.decDeg, 5)}</span>
            </dd>
            <dt>l, b</dt>
            <dd className="text-data">
              {formatDegrees(selection.galacticLongitude, 3)}, {formatSigned(selection.galacticLatitude, 3)}
            </dd>
            <dt>FOV</dt>
            <dd ref={fovRef} className="text-data" />
          </dl>
          <p className={styles.frameNote}>ICRS, J2000. Converted from the galactic map projection.</p>
          <Button fullWidth isLoading={isOpeningViewer} onClick={() => onOpenViewer(selection)}>
            View image
          </Button>
          <p className={styles.viewerHint}>Latest available observation, band {bandLabel}.</p>
        </section>
      )}

      <div className={styles.hint}>
        <p className={styles.hintTitle}>Sky sphere</p>
        <p>Drag to look around. Click a point to read its coordinates, then open the image viewer.</p>
        {UI_FEATURES.skyTargetMarkers && targets.length > 0 && (
          <p>Glowing dots are targets already mapped: hover one to open its images and spectrum.</p>
        )}
        <p className={styles.credit}>
          SPHEREx all-sky maps, NASA/JPL-Caltech. Galactic Mollweide projection, viewed from the center of the
          sphere.
        </p>
      </div>

      {status === 'ready' && (
        <div ref={controlsRef} className={styles.controls} role="toolbar" aria-label="Sky map controls">
          <div className={styles.mapChoice} role="group" aria-label="All-sky map">
            {(Object.keys(SKY_MAPS) as SkyMapId[]).map((id) => (
              <button
                key={id}
                type="button"
                className={buttonClassName({ variant: 'secondary', size: 'sm' })}
                aria-pressed={mapId === id}
                onClick={() => {
                  setMapId(id);
                  rendererRef.current?.load(SKY_MAPS[id].url);
                }}
              >
                {SKY_MAPS[id].label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={buttonClassName({ variant: 'secondary', size: 'sm' })}
            aria-pressed={gridOn}
            onClick={() => {
              const next = !gridOn;
              setGridOn(next);
              rendererRef.current?.setGrid(next);
            }}
          >
            Galactic grid
          </button>
          <button
            type="button"
            className={buttonClassName({ variant: 'secondary', size: 'sm' })}
            onClick={() => rendererRef.current?.resetView()}
          >
            Recenter
          </button>
          {UI_FEATURES.skyTargetList && targets.length > 0 && (
            <SkyTargetList targets={targets} onSelect={flyToTarget} />
          )}
          <span ref={centerRef} className={`text-data ${styles.readout}`} />
        </div>
      )}

      {status === 'loading' && (
        <div className={styles.overlay}>
          <LoadingState message="Loading sky map…" />
        </div>
      )}
      {status === 'error' && (
        <div className={styles.overlay}>
          <ErrorState
            title="Sky map unavailable"
            message="The all-sky image could not be loaded."
            onRetry={() => {
              setStatus('loading');
              setAttempt((value) => value + 1);
            }}
          />
        </div>
      )}
      {status === 'unsupported' && (
        <div className={styles.overlay}>
          <ErrorState title="Sky map unavailable" message="This browser cannot draw the sky sphere." />
        </div>
      )}
    </div>
  );
}

export default SkySphere;
