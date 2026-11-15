import Button from '../common/Button';
import type { SpectralBandId, SpectralBandOption } from '../../types/observation';
import styles from './SpectralBandPanel.module.css';

interface SpectralBandPanelProps {
  bands: readonly SpectralBandOption[];
  selectedBandIds: readonly SpectralBandId[];
  onToggle: (bandId: SpectralBandId) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  className?: string;
}

function SpectralBandPanel({
  bands,
  selectedBandIds,
  onToggle,
  onSelectAll,
  onClearAll,
  className,
}: SpectralBandPanelProps) {
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
          <label key={band.id} className={styles.option}>
            <input
              type="checkbox"
              checked={selectedBandIds.includes(band.id)}
              onChange={() => onToggle(band.id)}
            />
            <span>{band.label}</span>
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
