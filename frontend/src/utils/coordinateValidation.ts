import type { ValidationResult } from '../types/validation';

const DECIMAL_PATTERN = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;
const UNSIGNED_INTEGER_PATTERN = /^\d+$/;

/** Accepts "," as decimal separator and the Unicode minus sign. */
function normalizeNumericInput(raw: string): string {
  return raw.trim().replace(',', '.').replace('\u2212', '-');
}

export function parseDecimal(raw: string): number | null {
  const normalized = normalizeNumericInput(raw);
  return DECIMAL_PATTERN.test(normalized) ? Number(normalized) : null;
}

interface BoundedNumberRules {
  min: number;
  max: number;
  maxInclusive: boolean;
  integer: boolean;
  allowSign: boolean;
  rangeMessage: string;
}

function validateBoundedNumber(raw: string, rules: BoundedNumberRules): ValidationResult<number> {
  const normalized = normalizeNumericInput(raw);

  if (normalized === '') {
    return { ok: false, error: 'Required' };
  }

  if (!rules.allowSign && /^[+-]/.test(normalized)) {
    return { ok: false, error: rules.rangeMessage };
  }

  if (rules.integer && !UNSIGNED_INTEGER_PATTERN.test(normalized)) {
    return { ok: false, error: 'Use a whole number' };
  }

  const value = parseDecimal(normalized);
  if (value === null) {
    return { ok: false, error: 'Enter a number' };
  }

  const aboveMax = rules.maxInclusive ? value > rules.max : value >= rules.max;
  if (value < rules.min || aboveMax) {
    return { ok: false, error: rules.rangeMessage };
  }

  return { ok: true, value };
}

export function validateRaHours(raw: string): ValidationResult<number> {
  return validateBoundedNumber(raw, {
    min: 0,
    max: 24,
    maxInclusive: false,
    integer: true,
    allowSign: false,
    rangeMessage: 'Use 0–23',
  });
}

export function validateRaMinutes(raw: string): ValidationResult<number> {
  return validateBoundedNumber(raw, {
    min: 0,
    max: 60,
    maxInclusive: false,
    integer: true,
    allowSign: false,
    rangeMessage: 'Use 0–59',
  });
}

export function validateRaSeconds(raw: string): ValidationResult<number> {
  return validateBoundedNumber(raw, {
    min: 0,
    max: 60,
    maxInclusive: false,
    integer: false,
    allowSign: false,
    rangeMessage: 'Use 0 to < 60',
  });
}

export function validateDeclination(raw: string): ValidationResult<number> {
  return validateBoundedNumber(raw, {
    min: -90,
    max: 90,
    maxInclusive: true,
    integer: false,
    allowSign: true,
    rangeMessage: 'Use a value between −90° and +90°',
  });
}

export function isValidRaDegrees(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value < 360;
}

export function isValidDecDegrees(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}
