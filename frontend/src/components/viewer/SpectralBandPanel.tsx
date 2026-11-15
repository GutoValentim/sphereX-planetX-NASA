import Button from '../common/Button';
import { BAND_DISPLAY_COLOR } from '../../constants/spectralBands';
import type { SpectralBandId, SpectralBandOption } from '../../types/observation';
import styles from './SpectralBandPanel.module.css';

interface SpectralBandPanelProps {
  bands: readonly SpectralBandOption[];
  selectedBandIds: readonly SpectralBandId[];
  onToggle: (bandId: SpectralBandId) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  /** Per-band images ready / total while a live job renders; incomplete bands cannot be toggled yet. */
  bandProgress?: Readonly<Record<SpectralBandId, { done: number; total: number }>>;
  className?: string;
}

function SpectralBandPanel({
  bands,
  selectedBandIds,
  onToggle,
  onSelectAll,
  onClearAll,
  bandProgress,
  className,
}: SpectralBandPanelProps) {
  const pending = (bandId: SpectralBandId) => {
    const progress = bandProgress?.[bandId];
    return progress ? progress.done < progress.total || progress.total === 0 : false;
  };
  const allSelected = selectedBandIds.length === bands.length;
  const noneSelected = selectedBandIds.length === 0;

  return (
    <section className={[styles.panel, className].filter(Boolean).join(' ')} aria-labelledby="band-panel-title">
      <div className={styles.header}>
        <h2 id="band-panel-title" className={styles.title}>
          Spectral bands
        </h2>
        <div className={styles.bulkActions}>
          <Button variant="ghost" size="sm" onClick={onSelectAll} disabled={allSelected}>
            All
          </Button>
          <Button variant="ghost" size="sm" onClick={onClearAll} disabled={noneSelected}>
            None
          </Button>
        </div>
      </div>

      <fieldset className={styles.list}>
        <legend className="visually-hidden">Bands to display</legend>
        {bands.map((band) => (
          <label key={band.id} className={styles.option} data-pending={pending(band.id) || undefined}>
            <input
              type="checkbox"
              checked={selectedBandIds.includes(band.id)}
              onChange={() => onToggle(band.id)}
              disabled={pending(band.id)}
            />
            <span className={styles.label}>{band.label}</span>
            {pending(band.id) && (
              <span className={`text-data ${styles.progress}`} title="Still downloading this band">
                {bandProgress?.[band.id]?.total
                  ? `${Math.round(((bandProgress[band.id].done ?? 0) / bandProgress[band.id].total) * 100)}%`
                  : '…'}
              </span>
            )}
            {BAND_DISPLAY_COLOR[band.id] && (
              <span
                className={styles.swatch}
                style={{ backgroundColor: BAND_DISPLAY_COLOR[band.id] }}
                title={`${band.id} display color`}
                aria-hidden="true"
              />
            )}
          </label>
        ))}
      </fieldset>

      <p className={styles.status} role="status">
        {noneSelected
          ? 'No band selected. Select at least one band to display an image.'
          : `${selectedBandIds.length} of ${bands.length} selected`}
      </p>
    </section>
  );
}

export default SpectralBandPanel;
