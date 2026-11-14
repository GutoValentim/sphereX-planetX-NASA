import { useRef } from 'react';
import { CalendarIcon } from '../common/icons';
import FieldMessages, { fieldDescribedBy } from '../common/FieldMessages';
import fieldStyles from '../common/Field.module.css';
import { exploreFieldId } from '../../hooks/useExploreForm';
import type { DateMode } from '../../types/exploreForm';
import { isoToDisplayDate, maskDisplayDate, parseDisplayDate, todayIsoDate } from '../../utils/dateFormatting';
import styles from './ExploreForm.module.css';

interface DateSelectorProps {
  mode: DateMode;
  /** Date as displayed to the user (DD/MM/YYYY). */
  date: string;
  error?: string;
  onModeChange: (mode: DateMode) => void;
  onDateChange: (date: string) => void;
  onDateBlur: () => void;
}

const DATE_MODES: ReadonlyArray<{ value: DateMode; label: string }> = [
  { value: 'latest', label: 'Latest available observation' },
  { value: 'specific', label: 'Choose a date' },
];

function DateSelector({ mode, date, error, onModeChange, onDateChange, onDateBlur }: DateSelectorProps) {
  const nativePickerRef = useRef<HTMLInputElement>(null);
  const dateFieldId = exploreFieldId('date');
  const hint = 'Format: DD/MM/YYYY';
  const parsedDate = parseDisplayDate(date);

  const openCalendar = () => {
    const picker = nativePickerRef.current;
    if (!picker) return;

    try {
      picker.showPicker();
    } catch {
      picker.focus();
    }
  };

  return (
    <fieldset className={styles.section}>
      <legend className={styles.sectionTitle}>Observation date</legend>

      <div className={styles.radioGroup}>
        {DATE_MODES.map((option) => (
          <label key={option.value} className={styles.radioOption}>
            <input
              type="radio"
              name="explore-date-mode"
              value={option.value}
              checked={mode === option.value}
              onChange={() => onModeChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>

      {mode === 'specific' && (
        <div className={`${fieldStyles.field} ${styles.dateField}`}>
          <label htmlFor={dateFieldId} className={fieldStyles.label}>
            Date
          </label>
          <div className={fieldStyles.control}>
            <input
              id={dateFieldId}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="DD/MM/YYYY"
              maxLength={10}
              className={[fieldStyles.input, fieldStyles.withSuffix, error && fieldStyles.invalid]
                .filter(Boolean)
                .join(' ')}
              value={date}
              aria-invalid={error ? true : undefined}
              aria-describedby={fieldDescribedBy(dateFieldId, { hint, error })}
              onChange={(event) => onDateChange(maskDisplayDate(event.target.value))}
              onBlur={onDateBlur}
            />
            <button type="button" className={styles.calendarButton} onClick={openCalendar} aria-label="Open calendar">
              <CalendarIcon />
            </button>
            <input
              ref={nativePickerRef}
              type="date"
              className={styles.nativePicker}
              tabIndex={-1}
              aria-hidden="true"
              max={todayIsoDate()}
              value={parsedDate.ok ? parsedDate.value : ''}
              onChange={(event) => {
                onDateChange(isoToDisplayDate(event.target.value));
                onDateBlur();
              }}
            />
          </div>
          <FieldMessages fieldId={dateFieldId} hint={hint} error={error} />
        </div>
      )}
    </fieldset>
  );
}

export default DateSelector;
