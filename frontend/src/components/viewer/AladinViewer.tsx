import { useCallback, useEffect, useRef, useState } from 'react';
import type { AladinInstance } from 'aladin-lite';
import ErrorState from '../common/ErrorState';
import LoadingState from '../common/LoadingState';
import ViewerToolbar from './ViewerToolbar';
import { REFERENCE_SURVEY, VIEWER_OPTIONS, loadAladin } from '../../integrations/aladin';
import type { EquatorialCoordinates } from '../../types/coordinates';
import type { ObservationFrame } from '../../types/observation';
import { formatUtcDateTime } from '../../utils/dateFormatting';
import styles from './AladinViewer.module.css';

type ViewerStatus = 'loading' | 'ready' | 'error';

interface AladinViewerProps {
  target: EquatorialCoordinates;
  /** Observation selected in the timeline; its SPHEREx image will replace the reference survey once available. */
  observation: ObservationFrame | null;
  isDemoObservation: boolean;
}

/**
 * Boundary for the Aladin Lite integration. The rest of the app only depends on these props,
 * so the library can be connected or replaced without touching the page.
 */
function AladinViewer({ target, observation, isDemoObservation }: AladinViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const aladinRef = useRef<AladinInstance | null>(null);
  const targetRef = useRef(target);
  const [status, setStatus] = useState<ViewerStatus>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    targetRef.current = target;
    aladinRef.current?.gotoRaDec(target.raDeg, target.decDeg);
  }, [target]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    loadAladin()
      .then((A) => {
        if (cancelled) return;
        const { raDeg, decDeg } = targetRef.current;
        aladinRef.current = A.aladin(container, { ...VIEWER_OPTIONS, target: `${raDeg} ${decDeg}` });
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error('[AladinViewer] Failed to initialize Aladin Lite', error);
        setStatus('error');
      });

    return () => {
      cancelled = true;
      aladinRef.current = null;
      // Aladin Lite has no destroy API; removing its DOM releases the canvas and listeners.
      container.replaceChildren();
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setStatus('loading');
    setAttempt((value) => value + 1);
  }, []);

  const zoomIn = useCallback(() => aladinRef.current?.increaseZoom(), []);
  const zoomOut = useCallback(() => aladinRef.current?.decreaseZoom(), []);

  const observedAt = observation ? formatUtcDateTime(observation.observedAt) : null;

  return (
    <div className={styles.viewer}>
      {/* Aladin places its own widgets (search, field of view, logo) inside the map; app controls avoid those spots. */}
      <div className={styles.map}>
        <div
          ref={containerRef}
          className={styles.canvas}
          aria-label="Interactive sky map. Drag to pan and scroll to zoom."
          role="application"
        />

        <div className={styles.zoom}>
          <ViewerToolbar
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            disabledReason={status === 'ready' ? undefined : 'Zoom is available once the sky viewer has loaded.'}
          />
        </div>

        {status !== 'ready' && (
          <div className={styles.overlay}>
            <div className={styles.overlayCard}>
              {status === 'loading' ? (
                <LoadingState message="Loading sky viewer…" />
              ) : (
                <ErrorState
                  title="Sky viewer unavailable"
                  message="The interactive viewer could not start. It requires a browser with WebGL 2 support."
                  onRetry={retry}
                />
              )}
            </div>
          </div>
        )}
      </div>

      <p className={styles.caption}>
        <span>
          Reference survey: {REFERENCE_SURVEY.label} — <strong>not SPHEREx data</strong>
        </span>
        {observedAt && (
          <span className={styles.observation}>
            Selected observation: {observedAt.date} · {observedAt.time}
            {isDemoObservation && ' (demo)'}
          </span>
        )}
      </p>
    </div>
  );
}

export default AladinViewer;
