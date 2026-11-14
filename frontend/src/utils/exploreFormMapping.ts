import { DEFAULT_SPECTRAL_BAND } from '../constants/spectralBands';
import type { ExploreFormValues } from '../types/exploreForm';
import type { ObservationQuery } from '../types/observation';
import { raDegreesToHms, roundRaHms } from './coordinateConversion';
import { isoToDisplayDate } from './dateFormatting';

const SECONDS_DIGITS = 3;
const DEC_DIGITS = 6;

export const EMPTY_EXPLORE_FORM: ExploreFormValues = {
  raHours: '',
  raMinutes: '',
  raSeconds: '',
  dec: '',
  dateMode: 'latest',
  date: '',
  band: DEFAULT_SPECTRAL_BAND,
};

/** Rebuilds form values from a previous query, so the user can adjust it instead of starting over. */
export function formValuesFromQuery(query: ObservationQuery): ExploreFormValues {
  const ra = roundRaHms(raDegreesToHms(query.raDeg), SECONDS_DIGITS);

  return {
    raHours: String(ra.hours),
    raMinutes: String(ra.minutes),
    raSeconds: String(ra.seconds),
    dec: String(Number(query.decDeg.toFixed(DEC_DIGITS))),
    dateMode: query.observationDate ? 'specific' : 'latest',
    date: query.observationDate ? isoToDisplayDate(query.observationDate) : '',
    band: query.band,
  };
}
