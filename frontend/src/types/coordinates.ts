/** Right Ascension in sexagesimal hours, measured eastward from the vernal equinox. */
export interface RightAscensionHms {
  hours: number;
  minutes: number;
  seconds: number;
}

/** Equatorial coordinates in decimal degrees, as sent to the backend. */
export interface EquatorialCoordinates {
  /** Right Ascension, 0 ≤ ra < 360. */
  raDeg: number;
  /** Declination, -90 ≤ dec ≤ 90. */
  decDeg: number;
}
