import CoordinateInput from './CoordinateInput';
import { exploreFieldId } from '../../hooks/useExploreForm';
import type { ExploreFormErrors, ExploreFormField, ExploreFormValues } from '../../types/exploreForm';
import { formatDegrees } from '../../utils/coordinateConversion';
import styles from './ExploreForm.module.css';

type CoordinateField = Extract<ExploreFormField, 'raHours' | 'raMinutes' | 'raSeconds' | 'dec'>;

interface CoordinateFieldsProps {
  values: Pick<ExploreFormValues, CoordinateField>;
  errors: ExploreFormErrors;
  /** RA converted to decimal degrees, or null while the RA fields are incomplete or invalid. */
  raDegrees: number | null;
  onChange: (field: CoordinateField, value: string) => void;
  onBlur: (field: CoordinateField) => void;
}

const RA_INPUTS: ReadonlyArray<{ field: CoordinateField; label: string; unit: string; placeholder: string; inputMode: 'numeric' | 'decimal' }> = [
  { field: 'raHours', label: 'Hours', unit: 'h', placeholder: '0–23', inputMode: 'numeric' },
  { field: 'raMinutes', label: 'Minutes', unit: 'm', placeholder: '0–59', inputMode: 'numeric' },
  { field: 'raSeconds', label: 'Seconds', unit: 's', placeholder: '0–59.9', inputMode: 'decimal' },
];

function CoordinateFields({ values, errors, raDegrees, onChange, onBlur }: CoordinateFieldsProps) {
  return (
    <fieldset className={styles.section}>
      <legend className={styles.sectionTitle}>Celestial coordinates</legend>

      <fieldset className={styles.group} aria-describedby="explore-ra-description">
        <legend className={styles.groupTitle}>Right Ascension (RA)</legend>
        <p id="explore-ra-description" className={styles.groupDescription}>
          Measured eastward from the vernal equinox (RA 0h).
        </p>
        <div className={styles.raGrid}>
          {RA_INPUTS.map(({ field, label, unit, placeholder, inputMode }) => (
            <CoordinateInput
              key={field}
              id={exploreFieldId(field)}
              label={label}
              unit={unit}
              placeholder={placeholder}
              inputMode={inputMode}
              value={values[field]}
              error={errors[field]}
              onChange={(value) => onChange(field, value)}
              onBlur={() => onBlur(field)}
            />
          ))}
        </div>
        <p className={styles.conversion} aria-live="polite">
          {raDegrees !== null ? `= ${formatDegrees(raDegrees)} in decimal degrees` : '\u00a0'}
        </p>
      </fieldset>

      <div className={styles.group}>
        <CoordinateInput
          id={exploreFieldId('dec')}
          label="Declination (Dec)"
          unit="°"
          placeholder="−90 to +90"
          inputMode="text"
          hint="From −90° (south) to +90° (north). Decimal degrees are allowed."
          value={values.dec}
          error={errors.dec}
          onChange={(value) => onChange('dec', value)}
          onBlur={() => onBlur('dec')}
        />
      </div>
    </fieldset>
  );
}

export default CoordinateFields;
