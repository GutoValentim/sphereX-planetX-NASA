import { Link, type LinkProps } from 'react-router-dom';
import { buttonClassName, type ButtonStyleProps } from './buttonClassName';

type ButtonLinkProps = LinkProps & ButtonStyleProps;

/** Internal navigation link styled as a button. */
function ButtonLink({ variant, size, fullWidth, className, ...rest }: ButtonLinkProps) {
  return <Link className={buttonClassName({ variant, size, fullWidth }, className)} {...rest} />;
}

export default ButtonLink;
