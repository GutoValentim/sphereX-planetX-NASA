import type { ValidationResult } from '../types/validation';

const DISPLAY_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function isRealCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Today's date in the user's local time zone, as YYYY-MM-DD. */
export function todayIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Formats free typing into DD/MM/YYYY, inserting slashes as digits are entered. */
export function maskDisplayDate(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join('/');
}

export function isoToDisplayDate(iso: string): string {
  const match = ISO_DATE_PATTERN.exec(iso);
  if (!match) return '';
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

export interface UtcDateTimeParts {
  /** DD/MM/YYYY */
  date: string;
  /** HH:mm:ss UTC */
  time: string;
  /** YYYY-MM-DD, useful to compare with requested dates. */
  isoDate: string;
}

export function formatUtcDateTime(isoTimestamp: string): UtcDateTimeParts | null {
  const timestamp = new Date(isoTimestamp);
  if (Number.isNaN(timestamp.getTime())) return null;

  const year = timestamp.getUTCFullYear();
  const month = pad(timestamp.getUTCMonth() + 1);
  const day = pad(timestamp.getUTCDate());
  const time = `${pad(timestamp.getUTCHours())}:${pad(timestamp.getUTCMinutes())}:${pad(timestamp.getUTCSeconds())} UTC`;

  return { date: `${day}/${month}/${year}`, time, isoDate: `${year}-${month}-${day}` };
}

export function isValidIsoDate(iso: string): boolean {
  const match = ISO_DATE_PATTERN.exec(iso);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  return isRealCalendarDate(year, month, day);
}

/** Validates a DD/MM/YYYY date and returns it as ISO (YYYY-MM-DD). Future dates are rejected. */
export function parseDisplayDate(display: string): ValidationResult<string> {
  const trimmed = display.trim();

  if (trimmed === '') {
    return { ok: false, error: 'Enter a date or choose the latest observation' };
  }

  const match = DISPLAY_DATE_PATTERN.exec(trimmed);
  if (!match) {
    return { ok: false, error: 'Use the format DD/MM/YYYY' };
  }

  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);

  if (!isRealCalendarDate(year, month, day)) {
    return { ok: false, error: 'This date does not exist' };
  }

  const iso = `${yearText}-${monthText}-${dayText}`;
  if (iso > todayIsoDate()) {
    return { ok: false, error: 'The date cannot be in the future' };
  }

  return { ok: true, value: iso };
}
