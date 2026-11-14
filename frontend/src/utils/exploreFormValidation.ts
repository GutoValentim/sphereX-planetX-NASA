import type { ExploreFormErrors, ExploreFormValues } from '../types/exploreForm';
import type { ObservationQuery } from '../types/observation';
import { raHmsToDegrees } from './coordinateConversion';
import { validateDeclination, validateRaHours, validateRaMinutes, validateRaSeconds } from './coordinateValidation';
import { parseDisplayDate } from './dateFormatting';

export interface ExploreFormValidation {
  errors: ExploreFormErrors;
  /** RA in decimal degrees, available as soon as the three RA fields are valid. */
  raDeg: number | null;
  /** Present only when every field is valid. */
  query: ObservationQuery | null;
}

export function validateExploreForm(values: ExploreFormValues): ExploreFormValidation {
  const errors: ExploreFormErrors = {};

  const hours = validateRaHours(values.raHours);
  const minutes = validateRaMinutes(values.raMinutes);
  const seconds = validateRaSeconds(values.raSeconds);
  const dec = validateDeclination(values.dec);
  const date = values.dateMode === 'specific' ? parseDisplayDate(values.date) : null;
  const band = values.band.trim();

  if (!hours.ok) errors.raHours = hours.error;
  if (!minutes.ok) errors.raMinutes = minutes.error;
  if (!seconds.ok) errors.raSeconds = seconds.error;
  if (!dec.ok) errors.dec = dec.error;
  if (date && !date.ok) errors.date = date.error;
  if (!band) errors.band = 'Select a spectral band';

  const raDeg =
    hours.ok && minutes.ok && seconds.ok
      ? raHmsToDegrees({ hours: hours.value, minutes: minutes.value, seconds: seconds.value })
      : null;

  if (raDeg === null || !dec.ok || (date && !date.ok) || !band) {
    return { errors, raDeg, query: null };
  }

  return {
    errors,
    raDeg,
    query: {
      raDeg,
      decDeg: dec.value,
      observationDate: date?.ok ? date.value : null,
      band,
    },
  };
}
