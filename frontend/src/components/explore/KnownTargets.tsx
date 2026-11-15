import { Link } from 'react-router-dom';
import { useCatalog } from '../../hooks/useCatalog';
import { ROUTES } from '../../routes/paths';
import { formatTargetCoordinates, targetViewerParams } from '../../utils/catalogNavigation';
import styles from './KnownTargets.module.css';

/** Shortcut to targets already mapped by the lab: one click opens their images and spectrum. */
function KnownTargets() {
  const catalog = useCatalog();
  if (catalog.status !== 'ready' || catalog.targets.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="known-targets-title">
      <div className={styles.header}>
        <h2 id="known-targets-title" className={styles.title}>
          Mapped targets
        </h2>
        <p className={styles.note}>Ready to view, no waiting for the archive.</p>
      </div>
      <ul className={styles.list}>
        {catalog.targets.map((entry) => {
          const coords = formatTargetCoordinates(entry);
          return (
            <li key={entry.id}>
              <Link className={styles.item} to={{ pathname: ROUTES.viewer, search: `?${targetViewerParams(entry)}` }}>
                <span className={styles.name}>{entry.name}</span>
                <span className={`text-data ${styles.coords}`}>
                  {coords.ra} · {coords.dec}
                </span>
                <span className={styles.arrow} aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default KnownTargets;
