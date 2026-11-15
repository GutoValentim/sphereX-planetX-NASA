import { Link } from 'react-router-dom';
import ThemeSwitcher from '../common/ThemeSwitcher';
import { ROUTES, type RouteTarget } from '../../routes/paths';
import styles from './Header.module.css';

interface HeaderProps {
  /** Page title rendered as the page's main heading. */
  title?: string;
  /** When provided, a back link to this route is shown. */
  backTo?: RouteTarget;
}

function Header({ title, backTo }: HeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <div className={styles.start}>
          {backTo && (
            <Link to={backTo} className={styles.back}>
              <span aria-hidden="true">←</span> Back
            </Link>
          )}
          <Link to={ROUTES.home} className={styles.brand}>
            SPHEREx - Sky and Time Explorer
          </Link>
        </div>

        {title && <h1 className={styles.title}>{title}</h1>}

        <div className={styles.end}>
          <ThemeSwitcher />
        </div>
      </div>
    </header>
  );
}

export default Header;
