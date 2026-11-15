import { Link } from 'react-router-dom';
import LoadingState from '../common/LoadingState';
import { useCatalog } from '../../hooks/useCatalog';
import { ROUTES } from '../../routes/paths';
import { formatTargetCoordinates, targetViewerParams } from '../../utils/catalogNavigation';
import styles from './MappedTargetsPanel.module.css';

interface MappedTargetsPanelProps {
  /** Slug of the target on screen, highlighted in the list. */
  activeSlug: string | null;
}

/** Targets already mapped by the lab: opening one shows its stored images and spectrum instantly. */
function MappedTargetsPanel({ activeSlug }: MappedTargetsPanelProps) {
  const catalog = useCatalog();

  return (
    <section className={styles.panel} aria-labelledby="mapped-targets-title">
      <h2 id="mapped-targets-title" className={styles.title}>
        Mapped targets
      </h2>
      <p className={styles.note}>Pre-processed by the mapping lab. New targets appear as they are published.</p>
      {catalog.status === 'loading' ? (
        <LoadingState message="Loading targets…" />
      ) : catalog.status === 'error' ? (
        <p className={styles.note} role="status">
          {catalog.error}
        </p>
      ) : catalog.targets.length === 0 ? (
        <p className={styles.note} role="status">
          No mapped targets yet.
        </p>
      ) : (
        <ul className={styles.list}>
          {catalog.targets.map((entry) => {
            const coords = formatTargetCoordinates(entry);
            const active = entry.slug === activeSlug;
            return (
              <li key={entry.id}>
                <Link
                  className={styles.item}
                  to={{ pathname: ROUTES.viewer, search: `?${targetViewerParams(entry)}` }}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className={styles.name}>{entry.name}</span>
                  <span className={`text-data ${styles.coords}`}>
                    RA {coords.ra} · Dec {coords.dec}
                  </span>
                  {entry.description && <span className={styles.description}>{entry.description}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default MappedTargetsPanel;
