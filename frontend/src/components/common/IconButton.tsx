import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './IconButton.module.css';

export type IconButtonVariant = 'secondary' | 'ghost';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Accessible name; icons alone are not announced. */
  label: string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  size?: 'sm' | 'md';
  shape?: 'square' | 'circle';
}

/** Square or circular button holding a single icon (40px small, 44px default). */
function IconButton({
  label,
  icon,
  variant = 'secondary',
  size = 'md',
  shape = 'square',
  className,
  type = 'button',
  title,
  ...rest
}: IconButtonProps) {
  const classes = [styles.iconButton, styles[variant], styles[size], styles[shape], className]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={classes} aria-label={label} title={title ?? label} {...rest}>
      {icon}
    </button>
  );
}

export default IconButton;
