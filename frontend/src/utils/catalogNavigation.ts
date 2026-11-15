import { DEFAULT_SPECTRAL_BAND } from '../constants/spectralBands';
import { VIEWER_TARGET_PARAM } from '../routes/paths';
import type { CatalogEntry } from '../services/catalog';
import { formatDegrees, formatRaHms, raDegreesToHms } from './coordinateConversion';
import { toQueryParams } from './observationQueryParams';

/** Viewer query string for a mapped target: its coordinates plus the slug of the lab export. */
export function targetViewerParams(entry: Pick<CatalogEntry, 'slug' | 'ra_deg' | 'dec_deg'>): URLSearchParams {
  const params = toQueryParams({
    raDeg: entry.ra_deg,
    decDeg: entry.dec_deg,
    band: DEFAULT_SPECTRAL_BAND,
    observationDate: null,
  });
  params.set(VIEWER_TARGET_PARAM, entry.slug);
  return params;
}

/** "RA 219.8985° · Dec −60.8354°" plus the sexagesimal RA, for lists and cards. */
export function formatTargetCoordinates(entry: Pick<CatalogEntry, 'ra_deg' | 'dec_deg'>) {
  return {
    ra: formatDegrees(entry.ra_deg, 4),
    raHms: formatRaHms(raDegreesToHms(entry.ra_deg), 1),
    dec: formatDegrees(entry.dec_deg, 4, true),
  };
}
