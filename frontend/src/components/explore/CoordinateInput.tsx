import FieldMessages, { fieldDescribedBy } from '../common/FieldMessages';
import fieldStyles from '../common/Field.module.css';

interface CoordinateInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  unit?: string;
  placeholder?: string;
  inputMode?: 'decimal' | 'numeric' | 'text';
  hint?: string;
  error?: string;
}

function CoordinateInput({
  id,
  label,
  value,
  onChange,
  onBlur,
  unit,
  placeholder,
  inputMode = 'decimal',
  hint,
  error,
}: CoordinateInputProps) {
  const inputClassName = [
    fieldStyles.input,
    fieldStyles.data,
    unit && fieldStyles.withSuffix,
    error && fieldStyles.invalid,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={fieldStyles.field}>
      <label htmlFor={id} className={fieldStyles.label}>
        {label}
      </label>
      <div className={fieldStyles.control}>
        <input
          id={id}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          spellCheck={false}
          className={inputClassName}
          value={value}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={fieldDescribedBy(id, { hint, error })}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
        {unit && (
          <span className={fieldStyles.unit} aria-hidden="true">
            {unit}
          </span>
        )}
      </div>
      <FieldMessages fieldId={id} hint={hint} error={error} />
    </div>
  );
}

export default CoordinateInput;
