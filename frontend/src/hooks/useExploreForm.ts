import { useCallback, useMemo, useState, type FormEvent } from 'react';
import type { ExploreFormErrors, ExploreFormField, ExploreFormValues } from '../types/exploreForm';
import type { ObservationQuery } from '../types/observation';
import { EMPTY_EXPLORE_FORM } from '../utils/exploreFormMapping';
import { validateExploreForm } from '../utils/exploreFormValidation';

/** Order used to move focus to the first invalid field after a failed submit. */
const FIELD_ORDER: readonly ExploreFormField[] = ['raHours', 'raMinutes', 'raSeconds', 'dec', 'date', 'band'];

export function exploreFieldId(field: ExploreFormField): string {
  return `explore-${field}`;
}

export function useExploreForm(
  onValidSubmit: (query: ObservationQuery) => void,
  initialValues: ExploreFormValues = EMPTY_EXPLORE_FORM,
) {
  const [values, setValues] = useState<ExploreFormValues>(initialValues);
  const [touched, setTouched] = useState<Partial<Record<ExploreFormField, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const validation = useMemo(() => validateExploreForm(values), [values]);

  const visibleErrors = useMemo<ExploreFormErrors>(() => {
    if (submitAttempted) return validation.errors;

    const errors: ExploreFormErrors = {};
    for (const field of FIELD_ORDER) {
      if (touched[field] && validation.errors[field]) {
        errors[field] = validation.errors[field];
      }
    }
    return errors;
  }, [submitAttempted, touched, validation.errors]);

  const setField = useCallback(<K extends ExploreFormField>(field: K, value: ExploreFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
  }, []);

  /** Replaces some values (e.g. a mapped target's coordinates) and starts validation afresh. */
  const fillValues = useCallback((partial: Partial<ExploreFormValues>) => {
    setValues((current) => ({ ...current, ...partial }));
    setTouched({});
    setSubmitAttempted(false);
  }, []);

  const markTouched = useCallback((field: ExploreFormField) => {
    setTouched((current) => (current[field] ? current : { ...current, [field]: true }));
  }, []);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitAttempted(true);

      if (validation.query) {
        onValidSubmit(validation.query);
        return;
      }

      const firstInvalid = FIELD_ORDER.find((field) => validation.errors[field]);
      if (firstInvalid) {
        document.getElementById(exploreFieldId(firstInvalid))?.focus();
      }
    },
    [onValidSubmit, validation],
  );

  return {
    values,
    errors: visibleErrors,
    hasErrors: submitAttempted && validation.query === null,
    raDegrees: validation.raDeg,
    setField,
    fillValues,
    markTouched,
    handleSubmit,
  };
}
