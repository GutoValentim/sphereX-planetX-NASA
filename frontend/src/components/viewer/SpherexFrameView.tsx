import ArchiveUnavailable from './ArchiveUnavailable';
import LoadProgress from './LoadProgress';
import type { ObservationFrame, ObservationLoadStatus, SpectralBandId } from '../../types/observation';
import styles from './SpherexFrameView.module.css';

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

/**
 * SPHEREx images of the active epoch: one aligned false-color layer per selected band, blended
 * additively (screen) over black, north up and the target at the center. The band legend lives in
 * the band panel; live jobs show their real progress here.
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
  const done = progress?.done ?? 0;
  const total = progress?.total ?? 0;

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

  const layers = (frame.layers ?? []).filter((layer) => selectedBandIds.includes(layer.bandId));
  const ready = layers.filter((layer) => layer.imageUrl);
  const rendering = status === 'rendering' && total > 0;

  return (
    <div className={styles.stage} data-fit={fit}>
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
        <div className={styles.layers}>
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
      {rendering && ready.length > 0 && (
        <LoadProgress variant="bar" label="Rendering the remaining images" done={done} total={total} />
      )}
    </div>
  );
}

export default SpherexFrameView;
