import { useEffect, useRef } from 'react';
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
  /** Values to fill in from outside (e.g. a mapped target); a new nonce applies them again. */
  fill?: { values: Partial<ExploreFormValues>; nonce: number } | null;
}

function CoordinateForm({ onSubmit, initialValues, isSubmitting = false, fill = null }: CoordinateFormProps) {
  const { values, errors, hasErrors, raDegrees, setField, fillValues, markTouched, handleSubmit } = useExploreForm(
    onSubmit,
    initialValues,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Filled values are shown at once and the form takes focus again, ready to submit or adjust.
  useEffect(() => {
    if (!fill) return;
    fillValues(fill.values);
    const form = formRef.current;
    if (!form) return;
    form.scrollIntoView({ block: 'start', behavior: 'smooth' });
    document.getElementById(exploreFieldId('raHours'))?.focus({ preventScroll: true });
    form.dataset.filled = 'true';
    const timer = window.setTimeout(() => delete form.dataset.filled, 1200);
    return () => window.clearTimeout(timer);
  }, [fill, fillValues]);

  return (
    <form
      ref={formRef}
      className={styles.form}
      onSubmit={handleSubmit}
      noValidate
      aria-label="Sky exploration parameters"
    >
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
