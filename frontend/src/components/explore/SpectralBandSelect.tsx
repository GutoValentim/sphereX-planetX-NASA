import FieldMessages, { fieldDescribedBy } from '../common/FieldMessages';
import fieldStyles from '../common/Field.module.css';
import type { SpectralBandOption } from '../../types/observation';
import styles from './ExploreForm.module.css';

interface SpectralBandSelectProps {
  id: string;
  value: string;
  /** Options in display order (default band first). */
  options: readonly SpectralBandOption[];
  error?: string;
  onChange: (bandId: string) => void;
}

function SpectralBandSelect({ id, value, options, error, onChange }: SpectralBandSelectProps) {
  return (
    <div className={`${fieldStyles.field} ${styles.section}`}>
      <label htmlFor={id} className={styles.sectionTitle}>
        Spectral band
      </label>
      <select
        id={id}
        className={[fieldStyles.select, error && fieldStyles.invalid].filter(Boolean).join(' ')}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={fieldDescribedBy(id, { error })}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((band) => (
          <option key={band.id} value={band.id}>
            {band.label}
          </option>
        ))}
      </select>
      <FieldMessages fieldId={id} error={error} />
    </div>
  );
}

export default SpectralBandSelect;
