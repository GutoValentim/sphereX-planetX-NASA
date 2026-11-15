/**
 * Galactic ↔ equatorial conversion used by the sky sphere.
 * The all-sky images are Mollweide maps in galactic coordinates. A click yields a
 * direction in the sphere's world frame; these functions turn that direction into
 * ICRS (J2000) right ascension and declination.
 *
 * The matrix is the Hipparcos equatorial-to-galactic rotation. Checked against the
 * galactic center (l = 0°, b = 0°), which lands at RA 266.405°, Dec −28.936°.
 */

const DEG = 180 / Math.PI;

const EQUATORIAL_TO_GALACTIC = [
  [-0.0548755604162154, -0.873437090234885, -0.4838350155487132],
  [0.4941094278755837, -0.4448296299600112, 0.746982244497219],
  [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669],
] as const;

export type Vec3 = [number, number, number];

/**
 * World axes of the sphere: +X is the galactic center (l = 0°, b = 0°),
 * +Y is the north galactic pole, and −Z is galactic longitude 90°.
 */
export function worldDirectionToGalactic([x, y, z]: Vec3): Vec3 {
  return [x, -z, y];
}

/** Inverse of the Hipparcos rotation: equatorial = transpose × galactic. */
export function galacticVectorToEquatorial(galactic: Vec3): { raDeg: number; decDeg: number } {
  const equatorial = [0, 1, 2].map(
    (column) =>
      EQUATORIAL_TO_GALACTIC[0][column] * galactic[0] +
      EQUATORIAL_TO_GALACTIC[1][column] * galactic[1] +
      EQUATORIAL_TO_GALACTIC[2][column] * galactic[2],
  );
  let raDeg = Math.atan2(equatorial[1], equatorial[0]) * DEG;
  if (raDeg < 0) raDeg += 360;
  return {
    raDeg,
    decDeg: Math.asin(Math.max(-1, Math.min(1, equatorial[2]))) * DEG,
  };
}

export function galacticVectorToLongitudeLatitude(galactic: Vec3): { longitude: number; latitude: number } {
  let longitude = Math.atan2(galactic[1], galactic[0]) * DEG;
  if (longitude < 0) longitude += 360;
  return { longitude, latitude: Math.asin(galactic[2]) * DEG };
}

/** ICRS (J2000) position → unit direction in the sphere's world frame (inverse of the click path). */
export function equatorialToWorldDirection(raDeg: number, decDeg: number): Vec3 {
  const ra = raDeg / DEG;
  const dec = decDeg / DEG;
  const equatorial = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  const galactic = EQUATORIAL_TO_GALACTIC.map(
    (row) => row[0] * equatorial[0] + row[1] * equatorial[1] + row[2] * equatorial[2],
  );
  // worldDirectionToGalactic maps [x, y, z] → [x, −z, y].
  return [galactic[0], galactic[2], -galactic[1]];
}
