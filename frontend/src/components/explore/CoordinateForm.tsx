import Button from '../common/Button';
import CoordinateFields from './CoordinateFields';
import DateSelector from './DateSelector';
import SpectralBandSelect from './SpectralBandSelect';
import { DEFAULT_SPECTRAL_BAND, SPECTRAL_BANDS } from '../../constants/spectralBands';
import { exploreFieldId, useExploreForm } from '../../hooks/useExploreForm';
import type { ExploreFormValues } from '../../types/exploreForm';
import type { ObservationQuery } from '../../types/observation';
import { orderSpectralBands } from '../../utils/spectralBandOrder';
import styles from './ExploreForm.module.css';

const BAND_OPTIONS = orderSpectralBands(SPECTRAL_BANDS, DEFAULT_SPECTRAL_BAND);

interface CoordinateFormProps {
  onSubmit: (query: ObservationQuery) => void;
  /** Values used when the form mounts, e.g. a previous query. */
  initialValues?: ExploreFormValues;
  /** Shows the submit button as busy while the next page is loading. */
  isSubmitting?: boolean;
}

function CoordinateForm({ onSubmit, initialValues, isSubmitting = false }: CoordinateFormProps) {
  const { values, errors, hasErrors, raDegrees, setField, markTouched, handleSubmit } = useExploreForm(
    onSubmit,
    initialValues,
  );

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate aria-label="Sky exploration parameters">
      <CoordinateFields
        values={values}
        errors={errors}
        raDegrees={raDegrees}
        onChange={setField}
        onBlur={markTouched}
      />

      <DateSelector
        mode={values.dateMode}
        date={values.date}
        error={errors.date}
        onModeChange={(mode) => setField('dateMode', mode)}
        onDateChange={(date) => setField('date', date)}
        onDateBlur={() => markTouched('date')}
      />

      <SpectralBandSelect
        id={exploreFieldId('band')}
        value={values.band}
        options={BAND_OPTIONS}
        error={errors.band}
        onChange={(band) => setField('band', band)}
      />

      <div className={styles.actions}>
        {hasErrors && (
          <p className={styles.summary} role="alert">
            Please correct the highlighted fields.
          </p>
        )}
        <Button type="submit" size="lg" fullWidth isLoading={isSubmitting}>
          {isSubmitting ? (
            'Opening viewer…'
          ) : (
            <>
              Visualize <span aria-hidden="true">→</span>
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

export default CoordinateForm;
