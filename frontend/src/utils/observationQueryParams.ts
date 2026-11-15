import type { ObservationQuery } from '../types/observation';
import { isValidDecDegrees, isValidRaDegrees, parseDecimal } from './coordinateValidation';
import { isValidIsoDate } from './dateFormatting';

const PARAM = {
  ra: 'ra',
  dec: 'dec',
  date: 'date',
  band: 'band',
} as const;

const COORDINATE_PRECISION = 6;

export function toQueryParams(query: ObservationQuery): URLSearchParams {
  // Rounding can turn RA values just below 360° into 360°, which is the same point as 0°.
  const raDeg = Number(query.raDeg.toFixed(COORDINATE_PRECISION)) % 360;

  const params = new URLSearchParams({
    [PARAM.ra]: raDeg.toFixed(COORDINATE_PRECISION),
    [PARAM.dec]: query.decDeg.toFixed(COORDINATE_PRECISION),
    [PARAM.band]: query.band,
  });

  if (query.observationDate) {
    params.set(PARAM.date, query.observationDate);
  }

  return params;
}

/** Returns null when the URL does not describe a valid query (e.g. direct access to the viewer). */
export function fromQueryParams(params: URLSearchParams): ObservationQuery | null {
  const raDeg = parseDecimal(params.get(PARAM.ra) ?? '');
  const decDeg = parseDecimal(params.get(PARAM.dec) ?? '');
  const band = params.get(PARAM.band)?.trim();
  const date = params.get(PARAM.date);

  if (raDeg === null || !isValidRaDegrees(raDeg)) return null;
  if (decDeg === null || !isValidDecDegrees(decDeg)) return null;
  if (!band) return null;
  if (date !== null && !isValidIsoDate(date)) return null;

  return { raDeg, decDeg, band, observationDate: date };
}
