import type { RightAscensionHms } from '../types/coordinates';

const DEGREES_PER_HOUR = 15;

/** RA(deg) = 15 · (h + m/60 + s/3600) */
export function raHmsToDegrees({ hours, minutes, seconds }: RightAscensionHms): number {
  return DEGREES_PER_HOUR * (hours + minutes / 60 + seconds / 3600);
}

export function raDegreesToHms(raDeg: number): RightAscensionHms {
  const totalSeconds = (raDeg / DEGREES_PER_HOUR) * 3600;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds - hours * 3600) / 60);
  const seconds = totalSeconds - hours * 3600 - minutes * 60;

  return { hours, minutes, seconds };
}

/** Rounds seconds on the total, so that e.g. 59.999s carries into the next minute instead of becoming 60s. */
export function roundRaHms({ hours, minutes, seconds }: RightAscensionHms, secondsDigits: number): RightAscensionHms {
  const factor = 10 ** secondsDigits;
  const totalSeconds = Math.round((hours * 3600 + minutes * 60 + seconds) * factor) / factor;
  const wholeHours = Math.floor(totalSeconds / 3600);
  const wholeMinutes = Math.floor((totalSeconds - wholeHours * 3600) / 60);
  const remainingSeconds = Math.round((totalSeconds - wholeHours * 3600 - wholeMinutes * 60) * factor) / factor;

  return { hours: wholeHours % 24, minutes: wholeMinutes, seconds: remainingSeconds };
}

export function formatRaHms(hms: RightAscensionHms, secondsDigits = 2): string {
  const { hours, minutes, seconds } = roundRaHms(hms, secondsDigits);
  const paddedHours = String(hours).padStart(2, '0');
  const paddedMinutes = String(minutes).padStart(2, '0');
  const [secondsInt, secondsFraction] = seconds.toFixed(secondsDigits).split('.');
  const paddedSeconds = secondsInt.padStart(2, '0') + (secondsFraction ? `.${secondsFraction}` : '');

  return `${paddedHours}h ${paddedMinutes}m ${paddedSeconds}s`;
}

/** Display-only formatting; uses the typographic minus sign (−) for negative values. */
export function formatDegrees(degrees: number, fractionDigits = 4, signed = false): string {
  const magnitude = Math.abs(degrees).toFixed(fractionDigits);
  const isNegative = degrees < 0 && Number(magnitude) !== 0;
  const sign = isNegative ? '\u2212' : signed ? '+' : '';
  return `${sign}${magnitude}°`;
}
