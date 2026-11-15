import type { ButtonHTMLAttributes } from 'react';
import Spinner from './Spinner';
import { buttonClassName, type ButtonStyleProps } from './buttonClassName';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyleProps {
  /** Shows a spinner and disables the button while an action is in progress. */
  isLoading?: boolean;
}

function Button({
  variant,
  size,
  fullWidth,
  isLoading = false,
  disabled,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClassName({ variant, size, fullWidth }, className)}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...rest}
    >
      {isLoading && <Spinner size="sm" />}
      {children}
    </button>
  );
}

export default Button;
