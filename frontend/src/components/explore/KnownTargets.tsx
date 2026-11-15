import { useCatalog } from '../../hooks/useCatalog';
import type { CatalogEntry } from '../../services/catalog';
import { formatTargetCoordinates } from '../../utils/catalogNavigation';
import styles from './KnownTargets.module.css';

interface KnownTargetsProps {
  /** Fills the coordinate form with the target (it does not open the viewer by itself). */
  onSelect: (entry: CatalogEntry) => void;
  selectedId?: string | null;
}

/** Targets already mapped by the lab; choosing one fills in its coordinates. */
function KnownTargets({ onSelect, selectedId = null }: KnownTargetsProps) {
  const catalog = useCatalog();

  if (catalog.status === 'loading') {
    return <p className={styles.note}>Loading mapped targets…</p>;
  }
  if (catalog.status !== 'ready' || catalog.targets.length === 0) {
    return <p className={styles.note}>No mapped targets yet.</p>;
  }

  return (
    <section className={styles.section} aria-labelledby="known-targets-title">
      <div className={styles.header}>
        <h2 id="known-targets-title" className={styles.title}>
          Mapped targets
        </h2>
        <p className={styles.note}>Choose one to fill in its coordinates. Its images and spectrum are ready.</p>
      </div>
      <ul className={styles.list}>
        {catalog.targets.map((entry) => {
          const coords = formatTargetCoordinates(entry);
          return (
            <li key={entry.id}>
              <button
                type="button"
                className={styles.item}
                aria-pressed={entry.id === selectedId}
                onClick={() => onSelect(entry)}
              >
                <span className={styles.name}>{entry.name}</span>
                <span className={`text-data ${styles.coords}`}>
                  {coords.ra} · {coords.dec}
                </span>
                <span className={styles.arrow} aria-hidden="true">
                  →
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default KnownTargets;
