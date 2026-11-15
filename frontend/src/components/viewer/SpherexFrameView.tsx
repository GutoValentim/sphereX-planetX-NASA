import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import ArchiveUnavailable from './ArchiveUnavailable';
import LoadProgress from './LoadProgress';
import ViewerToolbar from './ViewerToolbar';
import type { ObservationFrame, ObservationLoadStatus, SpectralBandId } from '../../types/observation';
import styles from './SpherexFrameView.module.css';

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

interface Pan {
  x: number;
  y: number;
}

interface SpherexFrameViewProps {
  frame: ObservationFrame | null;
  selectedBandIds: readonly SpectralBandId[];
  status: ObservationLoadStatus;
  error?: string | null;
  /** Rendered layers / total layers of a live job. */
  progress?: { done: number; total: number };
  onRetry?: () => void;
  /** "cover" fills a wide frame, cropping the top and bottom of the square images. */
  fit?: 'contain' | 'cover';
}

function clampPan(scale: number, pan: Pan, width: number, height: number): Pan {
  if (scale <= MIN_ZOOM) return { x: 0, y: 0 };
  const maxX = ((scale - 1) * width) / 2;
  const maxY = ((scale - 1) * height) / 2;
  return {
    x: Math.min(maxX, Math.max(-maxX, pan.x)),
    y: Math.min(maxY, Math.max(-maxY, pan.y)),
  };
}

/**
 * SPHEREx images of the active epoch: one aligned false-color layer per selected band, blended
 * additively (screen) over black, north up and the target at the center. Scroll and the +/− buttons
 * zoom; drag moves the zoomed image. The band legend lives in the band panel.
 */
function SpherexFrameView({
  frame,
  selectedBandIds,
  status,
  error,
  progress,
  onRetry,
  fit = 'contain',
}: SpherexFrameViewProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; pan: Pan } | null>(null);
  const [scale, setScale] = useState(MIN_ZOOM);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [grabbing, setGrabbing] = useState(false);
  const scaleRef = useRef(scale);
  const panRef = useRef(pan);
  scaleRef.current = scale;
  panRef.current = pan;

  const done = progress?.done ?? 0;
  const total = progress?.total ?? 0;
  const layers = (frame?.layers ?? []).filter((layer) => selectedBandIds.includes(layer.bandId));
  const ready = layers.filter((layer) => layer.imageUrl);
  const interactive = ready.length > 0;

  const applyZoom = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const current = scaleRef.current;
    const currentPan = panRef.current;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current * factor));
    const originX = clientX == null ? rect.left + rect.width / 2 : clientX;
    const originY = clientY == null ? rect.top + rect.height / 2 : clientY;
    const centerX = originX - rect.left - rect.width / 2;
    const centerY = originY - rect.top - rect.height / 2;
    const imageX = (centerX - currentPan.x) / current;
    const imageY = (centerY - currentPan.y) / current;
    const nextPan = clampPan(next, { x: centerX - imageX * next, y: centerY - imageY * next }, rect.width, rect.height);
    scaleRef.current = next;
    panRef.current = nextPan;
    setScale(next);
    setPan(nextPan);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !interactive) return undefined;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      applyZoom(factor, event.clientX, event.clientY);
    };

    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [applyZoom, interactive]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, pan };
    event.currentTarget.setPointerCapture(event.pointerId);
    setGrabbing(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    setPan(
      clampPan(
        scale,
        { x: drag.pan.x + event.clientX - drag.x, y: drag.pan.y + event.clientY - drag.y },
        rect.width,
        rect.height,
      ),
    );
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setGrabbing(false);
  };

  if (status === 'error' && (!frame || !frame.layers?.some((layer) => layer.imageUrl))) {
    return (
      <div className={styles.center}>
        <ArchiveUnavailable detail={error} onRetry={onRetry} />
      </div>
    );
  }

  if (!frame) {
    return (
      <div className={styles.center}>
        <LoadProgress
          label="Searching the SPHEREx archive (NASA/IPAC IRSA)…"
          detail="Finding every observation of this point. A new coordinate takes a minute or two."
        />
      </div>
    );
  }

  const rendering = status === 'rendering' && total > 0;

  return (
    <div
      ref={stageRef}
      className={styles.stage}
      data-fit={fit}
      data-zoomable={interactive ? 'true' : undefined}
      data-grabbing={grabbing ? 'true' : undefined}
      onPointerDown={interactive ? onPointerDown : undefined}
      onPointerMove={interactive ? onPointerMove : undefined}
      onPointerUp={interactive ? endDrag : undefined}
      onPointerCancel={interactive ? endDrag : undefined}
    >
      {selectedBandIds.length === 0 ? (
        <p className={styles.notice}>Select at least one band to display an image.</p>
      ) : ready.length === 0 ? (
        <div className={styles.center}>
          <LoadProgress
            label="Aligning and rendering SPHEREx images…"
            done={done}
            total={total}
            detail={total ? `${done} of ${total} band images ready` : undefined}
          />
        </div>
      ) : (
        <div
          className={styles.layers}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
        >
          {ready.map((layer) => (
            <img
              key={layer.imageUrl}
              className={styles.layer}
              src={layer.imageUrl ?? undefined}
              alt={`SPHEREx ${layer.bandId} image observed ${layer.observedAt}`}
              draggable={false}
            />
          ))}
        </div>
      )}
      {interactive && (
        <div className={styles.zoom}>
          <ViewerToolbar
            onZoomIn={() => applyZoom(1.25)}
            onZoomOut={() => applyZoom(1 / 1.25)}
          />
        </div>
      )}
      {rendering && ready.length > 0 && (
        <LoadProgress variant="bar" label="Rendering the remaining images" done={done} total={total} />
      )}
    </div>
  );
}

export default SpherexFrameView;
