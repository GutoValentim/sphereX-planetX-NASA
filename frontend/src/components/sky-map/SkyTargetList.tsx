import { useEffect, useId, useRef, useState } from 'react';
import { buttonClassName } from '../common/buttonClassName';
import type { CatalogEntry } from '../../services/catalog';
import { formatTargetCoordinates } from '../../utils/catalogNavigation';
import styles from './SkyTargetList.module.css';

interface SkyTargetListProps {
  targets: readonly CatalogEntry[];
  /** Flies the camera to the target (and opens its card); the list closes. */
  onSelect: (entry: CatalogEntry) => void;
}

/** "Mapped targets" button in the sky toolbar, with a list that takes the camera to each target. */
function SkyTargetList({ targets, onSelect }: SkyTargetListProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const needle = filter.trim().toLowerCase();
  const visible = needle
    ? targets.filter((entry) => `${entry.name} ${entry.description}`.toLowerCase().includes(needle))
    : targets;

  return (
    <div ref={rootRef} className={styles.root}>
      <button
        type="button"
        className={buttonClassName({ variant: 'secondary', size: 'sm' })}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        disabled={targets.length === 0}
      >
        Mapped targets <span className={styles.count}>{targets.length}</span>
      </button>

      {open && (
        <div id={listId} className={styles.popover} role="dialog" aria-label="Mapped targets">
          {targets.length > 6 && (
            <input
              className={styles.search}
              type="search"
              placeholder="Filter by name"
              aria-label="Filter mapped targets"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              autoFocus
            />
          )}
          <ul className={styles.list}>
            {visible.map((entry) => {
              const coords = formatTargetCoordinates(entry);
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={styles.item}
                    onClick={() => {
                      setOpen(false);
                      onSelect(entry);
                    }}
                  >
                    <span className={styles.name}>{entry.name}</span>
                    <span className={`text-data ${styles.coords}`}>
                      RA {coords.ra} · Dec {coords.dec}
                    </span>
                  </button>
                </li>
              );
            })}
            {visible.length === 0 && <li className={styles.empty}>No target matches.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

export default SkyTargetList;
