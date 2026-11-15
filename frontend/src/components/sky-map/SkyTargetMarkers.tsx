import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Button from '../common/Button';
import { UI_FEATURES } from '../../constants/uiFeatures';
import type { CatalogEntry } from '../../services/catalog';
import { formatTargetCoordinates } from '../../utils/catalogNavigation';
import { equatorialToWorldDirection, type Vec3 } from '../../utils/galacticCoordinates';
import type { SkySphereRenderer } from './skySphereRenderer';
import styles from './SkyTargetMarkers.module.css';

const TONES = 5;
const CLOSE_DELAY_MS = 220;

export interface TargetOpenRequest {
  id: string;
  /** Changes on every request, so asking for the same target twice reopens it. */
  nonce: number;
}

interface SkyTargetMarkersProps {
  targets: readonly CatalogEntry[];
  rendererRef: React.RefObject<SkySphereRenderer | null>;
  /** Registers a callback run after every sky redraw; returns the unsubscribe function. */
  subscribeFrame: (listener: () => void) => () => void;
  openRequest: TargetOpenRequest | null;
  onOpenTarget: (entry: CatalogEntry) => void;
  /** Called when a target card is pinned by a click (e.g. to close the selected-point card). */
  onPin?: () => void;
}

/** Small deterministic PRNG, so each target keeps its size, tone and rhythm across renders. */
function seeded(id: string) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 15), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    hash ^= hash >>> 16;
    return (hash >>> 0) / 4294967296;
  };
}

function markerStyle(id: string): CSSProperties {
  const random = seeded(id);
  const scale = 0.8 + random() * 0.5;
  const tone = 1 + Math.floor(random() * TONES);
  return {
    '--target-scale': scale.toFixed(3),
    '--target-tone': `var(--sky-target-${tone})`,
    '--target-delay': `${(-random() * 6).toFixed(2)}s`,
    '--target-orbit-a': `${(7 + random() * 6).toFixed(2)}s`,
    '--target-orbit-b': `${(11 + random() * 8).toFixed(2)}s`,
    '--target-pulse': `${(2.6 + random() * 1.8).toFixed(2)}s`,
  } as CSSProperties;
}

/**
 * Mapped targets drawn on the sky sphere as softly glowing, animated dots. Hovering (or focusing)
 * one shows its card; clicking pins the card. Positions follow the camera on every redraw.
 */
function SkyTargetMarkers({ targets, rendererRef, subscribeFrame, openRequest, onOpenTarget, onPin }: SkyTargetMarkersProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const markerEls = useRef(new Map<string, HTMLButtonElement>());
  const closeTimer = useRef<number | undefined>(undefined);
  const [active, setActive] = useState<{ id: string; pinned: boolean } | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  const worlds = useMemo(
    () => new Map<string, Vec3>(targets.map((entry) => [entry.id, equatorialToWorldDirection(entry.ra_deg, entry.dec_deg)])),
    [targets],
  );
  const styleById = useMemo(() => new Map(targets.map((entry) => [entry.id, markerStyle(entry.id)])), [targets]);

  const paint = useCallback(() => {
    const renderer = rendererRef.current;
    const layer = layerRef.current;
    if (!renderer || !layer) return;
    for (const [id, element] of markerEls.current) {
      const world = worlds.get(id);
      if (!world) continue;
      const at = renderer.project(world);
      element.hidden = !at.visible;
      element.style.transform = `translate(${at.x}px, ${at.y}px)`;
    }

    const card = cardRef.current;
    const current = activeRef.current;
    const world = current ? worlds.get(current.id) : undefined;
    if (!card || !world) return;
    const at = renderer.project(world);
    card.hidden = !at.visible;
    const width = layer.clientWidth;
    const height = layer.clientHeight;
    const margin = 12;
    const reservedBottom = 76;
    const gap = 22;
    const left = at.x + gap + card.offsetWidth + margin > width ? at.x - gap - card.offsetWidth : at.x + gap;
    const top = at.y - card.offsetHeight / 2;
    card.style.left = `${Math.max(margin, Math.min(width - card.offsetWidth - margin, left))}px`;
    card.style.top = `${Math.max(margin, Math.min(height - card.offsetHeight - reservedBottom, top))}px`;
  }, [rendererRef, worlds]);

  useEffect(() => subscribeFrame(paint), [subscribeFrame, paint]);
  useLayoutEffect(() => paint(), [paint, active, targets]);

  useEffect(() => {
    if (openRequest && worlds.has(openRequest.id)) setActive({ id: openRequest.id, pinned: true });
  }, [openRequest, worlds]);

  // A click on the sky (outside markers and card) or Escape closes a pinned card.
  useEffect(() => {
    if (!active) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const node = event.target as Node;
      if (layerRef.current?.contains(node)) return;
      setActive(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActive(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [active]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const keepOpen = () => window.clearTimeout(closeTimer.current);
  const scheduleClose = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      setActive((current) => (current && !current.pinned ? null : current));
    }, CLOSE_DELAY_MS);
  };
  const hover = (id: string) => {
    keepOpen();
    setActive((current) => (current?.pinned && current.id !== id ? current : { id, pinned: current?.id === id && current.pinned }));
  };

  const activeEntry = active ? targets.find((entry) => entry.id === active.id) : undefined;
  const coords = activeEntry ? formatTargetCoordinates(activeEntry) : null;

  return (
    <div ref={layerRef} className={styles.layer}>
      {targets.map((entry) => (
        <button
          key={entry.id}
          ref={(node) => {
            if (node) markerEls.current.set(entry.id, node);
            else markerEls.current.delete(entry.id);
          }}
          type="button"
          className={styles.target}
          style={styleById.get(entry.id)}
          data-active={active?.id === entry.id || undefined}
          aria-label={`${entry.name}, mapped target`}
          aria-expanded={active?.id === entry.id}
          onPointerEnter={() => hover(entry.id)}
          onPointerLeave={scheduleClose}
          onFocus={() => hover(entry.id)}
          onClick={() => {
            onPin?.();
            setActive({ id: entry.id, pinned: true });
          }}
          hidden
        >
          <span className={styles.halo} aria-hidden="true" />
          <span className={`${styles.orbit} ${styles.orbitA}`} aria-hidden="true" />
          <span className={`${styles.orbit} ${styles.orbitB}`} aria-hidden="true" />
          <span className={styles.core} aria-hidden="true" />
          {UI_FEATURES.skyTargetLabels && (
            <span className={styles.label} aria-hidden="true">
              {entry.name}
            </span>
          )}
        </button>
      ))}

      {activeEntry && coords && (
        <section
          ref={cardRef}
          className={styles.card}
          role="dialog"
          aria-label={activeEntry.name}
          onPointerEnter={keepOpen}
          onPointerLeave={scheduleClose}
        >
          <header className={styles.cardHeader}>
            <p className={styles.eyebrow}>Mapped target</p>
            <h2 className={styles.name}>{activeEntry.name}</h2>
          </header>
          {activeEntry.description && <p className={styles.description}>{activeEntry.description}</p>}
          <dl className={styles.coords}>
            <dt>RA</dt>
            <dd>
              <span className="text-data">{coords.ra}</span>
              <small>{coords.raHms}</small>
            </dd>
            <dt>Dec</dt>
            <dd className="text-data">{coords.dec}</dd>
          </dl>
          <Button fullWidth size="sm" onClick={() => onOpenTarget(activeEntry)}>
            Open images & spectrum <span aria-hidden="true">→</span>
          </Button>
        </section>
      )}
    </div>
  );
}

export default SkyTargetMarkers;
