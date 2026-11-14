import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonStyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export function buttonClassName(
  { variant = 'primary', size = 'md', fullWidth = false }: ButtonStyleProps,
  extraClassName?: string,
): string {
  return [styles.button, styles[variant], styles[size], fullWidth && styles.fullWidth, extraClassName]
    .filter(Boolean)
    .join(' ');
}
