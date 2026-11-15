import { Link } from 'react-router-dom';
import { ROUTES } from '../../routes/paths';
import styles from './ExploreModeSwitch.module.css';

export type ExploreMode = 'coordinates' | 'sky';

interface ExploreModeSwitchProps {
  /** Mode of the current page; none on the image page. */
  current?: ExploreMode | null;
  /** Query string carried to the coordinates page (prefills the form), e.g. from the image page. */
  coordinatesSearch?: string;
  /** "overlay" sits on the dark sky map. */
  tone?: 'page' | 'overlay';
  className?: string;
}

/** Switches between the two ways to explore: typing coordinates or picking on the sky sphere. */
function ExploreModeSwitch({ current = null, coordinatesSearch, tone = 'page', className }: ExploreModeSwitchProps) {
  const items: { mode: ExploreMode; label: string; to: { pathname: string; search?: string } }[] = [
    { mode: 'coordinates', label: 'Search coordinates', to: { pathname: ROUTES.explore, search: coordinatesSearch } },
    { mode: 'sky', label: 'Sky map', to: { pathname: ROUTES.sky } },
  ];

  return (
    <nav
      className={[styles.switch, tone === 'overlay' && styles.overlay, className].filter(Boolean).join(' ')}
      aria-label="Exploration mode"
    >
      {items.map((item) => (
        <Link
          key={item.mode}
          to={item.to}
          className={styles.item}
          aria-current={item.mode === current ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export default ExploreModeSwitch;
