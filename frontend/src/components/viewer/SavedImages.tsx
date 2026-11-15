import { useEffect, useId, useRef, useState } from 'react';
import { formatDegrees } from '../../utils/coordinateConversion';
import { formatUtcDateTime } from '../../utils/dateFormatting';
import { readImageHistory, type SavedImage } from '../../utils/imageHistory';
import styles from './SavedImages.module.css';

interface SavedImagesProps {
  onOpen: (image: SavedImage) => void;
}

/** Previously rendered coordinates. Reopening one reuses the backend's cached frames. */
function SavedImages({ onOpen }: SavedImagesProps) {
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<SavedImage[]>([]);
  const [position, setPosition] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    setImages(readImageHistory());
  }, [open]);

  return (
    <div className={styles.wrap}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        Saved images
      </button>
      {open && (
        <div
          id={panelId}
          className={styles.panel}
          style={{ top: position.top, right: position.right }}
          role="region"
          aria-label="Saved images"
        >
          {images.length === 0 ? (
            <p className={styles.empty}>Images you have already rendered will be listed here.</p>
          ) : (
            <ul className={styles.list}>
              {images.map((image) => {
                const when = formatUtcDateTime(image.savedAt);
                return (
                  <li key={`${image.raDeg}-${image.decDeg}-${image.band}-${image.observationDate ?? 'latest'}`}>
                    <button type="button" className={styles.item} onClick={() => onOpen(image)}>
                      <span className="text-data">
                        RA {formatDegrees(image.raDeg, 3)} · Dec {formatDegrees(image.decDeg, 3, true)}
                      </span>
                      <span className={styles.meta}>
                        {image.band === 'P' ? 'All bands' : image.band}
                        {image.observationDate ? ` · ${image.observationDate}` : ' · latest'}
                        {when ? ` · saved ${when.date}` : ''}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default SavedImages;
