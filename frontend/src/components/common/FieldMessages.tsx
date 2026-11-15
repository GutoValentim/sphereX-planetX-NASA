import styles from './Field.module.css';

interface FieldMessagesProps {
  fieldId: string;
  hint?: string;
  error?: string;
}

export function fieldHintId(fieldId: string): string {
  return `${fieldId}-hint`;
}

export function fieldErrorId(fieldId: string): string {
  return `${fieldId}-error`;
}

/** Value for aria-describedby, linking a control to its visible hint and error. */
export function fieldDescribedBy(fieldId: string, { hint, error }: { hint?: string; error?: string }) {
  const ids = [hint && fieldHintId(fieldId), error && fieldErrorId(fieldId)].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

function FieldMessages({ fieldId, hint, error }: FieldMessagesProps) {
  return (
    <>
      {hint && (
        <p id={fieldHintId(fieldId)} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={fieldErrorId(fieldId)} className={styles.error}>
          {error}
        </p>
      )}
    </>
  );
}

export default FieldMessages;
