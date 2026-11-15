import ErrorState from '../common/ErrorState';
import LoadingState from '../common/LoadingState';
import type { ObservationFrame, ObservationLoadStatus, SpectralBandId } from '../../types/observation';
import styles from './SpherexFrameView.module.css';

interface SpherexFrameViewProps {
  frame: ObservationFrame | null;
  selectedBandIds: readonly SpectralBandId[];
  status: ObservationLoadStatus;
  error?: string | null;
  progress?: { done: number; total: number };
}

function formatOffset(seconds: number): string {
  if (seconds === 0) return 'same epoch';
  const sign = seconds > 0 ? '+' : '−';
  const absolute = Math.abs(seconds);
  if (absolute < 3600) return `${sign}${(absolute / 60).toFixed(0)} min`;
  if (absolute < 86400) return `${sign}${(absolute / 3600).toFixed(1)} h`;
  return `${sign}${(absolute / 86400).toFixed(1)} d`;
}

/**
 * SPHEREx images of the active epoch: one aligned false-color layer per selected band, blended
 * additively (screen) over black, north up and the target at the center.
 */
function SpherexFrameView({ frame, selectedBandIds, status, error, progress }: SpherexFrameViewProps) {
  if (!frame) {
    if (status === 'error') {
      return (
        <div className={styles.center}>
          <ErrorState title="SPHEREx data unavailable" message={error ?? 'The observations could not be loaded.'} />
        </div>
      );
    }
    return (
      <div className={styles.center}>
        <LoadingState message="Searching the SPHEREx archive (NASA/IPAC IRSA)…" />
      </div>
    );
  }

  const layers = (frame.layers ?? []).filter((layer) => selectedBandIds.includes(layer.bandId));
  const ready = layers.filter((layer) => layer.imageUrl);
  const progressText = progress && progress.total ? ` (${progress.done}/${progress.total})` : '';

  return (
    <div className={styles.view}>
      <div className={styles.stage}>
        {selectedBandIds.length === 0 ? (
          <p className={styles.notice}>Select at least one band to display an image.</p>
        ) : ready.length === 0 ? (
          <div className={styles.center}>
            <LoadingState message={`Aligning and rendering SPHEREx images${progressText}…`} />
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
            <span className={styles.reticle} aria-hidden="true" />
          </div>
        )}
      </div>

      <ul className={styles.legend} aria-label="Bands in this image">
        {layers.map((layer) => {
          const color = layer.color ? `rgb(${layer.color.join(',')})` : 'currentColor';
          const range = layer.wavelengthRangeUm
            ? ` · ${layer.wavelengthRangeUm[0].toFixed(2)}–${layer.wavelengthRangeUm[1].toFixed(2)} µm`
            : '';
          const state = layer.error ? ' · failed' : layer.imageUrl ? '' : ' · rendering';
          return (
            <li key={layer.bandId} className={layer.imageUrl ? styles.chip : `${styles.chip} ${styles.pending}`}>
              <span className={styles.swatch} style={{ background: color }} aria-hidden="true" />
              {layer.bandId}
              {range} · {formatOffset(layer.deltaSeconds)}
              {state}
            </li>
          );
        })}
      </ul>
      <p className={styles.caption}>
        SPHEREx (NASA/IPAC IRSA) · false color by wavelength · aligned, north up, target at the center
        {status === 'rendering' && ` · rendering${progressText}`}
      </p>
    </div>
  );
}

export default SpherexFrameView;
