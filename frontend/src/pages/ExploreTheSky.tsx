import { useCallback, useMemo, useState, useTransition } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Button from '../components/common/Button';
import ButtonLink from '../components/common/ButtonLink';
import CoordinateForm from '../components/explore/CoordinateForm';
import KnownTargets from '../components/explore/KnownTargets';
import ExploreModeSwitch from '../components/layout/ExploreModeSwitch';
import PageContainer from '../components/layout/PageContainer';
import { UI_FEATURES } from '../constants/uiFeatures';
import { useCatalog } from '../hooks/useCatalog';
import { ROUTES, VIEWER_TARGET_PARAM } from '../routes/paths';
import { CATALOG_ENABLED, type CatalogEntry } from '../services/catalog';
import type { ExploreFormValues } from '../types/exploreForm';
import type { ObservationQuery } from '../types/observation';
import { formValuesFromQuery } from '../utils/exploreFormMapping';
import { fromQueryParams, toQueryParams } from '../utils/observationQueryParams';
import styles from './ExploreTheSky.module.css';

type ExploreTab = 'coordinates' | 'targets';

/** Filled coordinates are rounded (RA to 1 ms, Dec to 1 µ°): anything closer is the same target. */
const SAME_TARGET_DEG = 1e-4;

const SHOW_TARGETS_TAB = UI_FEATURES.exploreTargetsList && CATALOG_ENABLED;

function coordinateValues(entry: CatalogEntry): Partial<ExploreFormValues> {
  const { raHours, raMinutes, raSeconds, dec } = formValuesFromQuery({
    raDeg: entry.ra_deg,
    decDeg: entry.dec_deg,
    band: '',
    observationDate: null,
  });
  return { raHours, raMinutes, raSeconds, dec };
}

function matchesTarget(query: ObservationQuery, entry: CatalogEntry): boolean {
  const deltaRa = Math.abs(((query.raDeg - entry.ra_deg + 540) % 360) - 180);
  return deltaRa < SAME_TARGET_DEG && Math.abs(query.decDeg - entry.dec_deg) < SAME_TARGET_DEG;
}

function ExploreTheSky() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Keeps this page visible, with a busy button, while the lazily loaded viewer page downloads.
  const [isNavigating, startTransition] = useTransition();
  const catalog = useCatalog();
  const [tab, setTab] = useState<ExploreTab>('coordinates');
  const [selectedTarget, setSelectedTarget] = useState<CatalogEntry | null>(null);
  const [fill, setFill] = useState<{ values: Partial<ExploreFormValues>; nonce: number } | null>(null);

  const initialValues = useMemo(() => {
    const previousQuery = fromQueryParams(searchParams);
    return previousQuery ? formValuesFromQuery(previousQuery) : undefined;
  }, [searchParams]);

  const handleSubmit = useCallback(
    (query: ObservationQuery) => {
      const params = toQueryParams(query);
      // Unchanged coordinates of a mapped target open its stored images and spectrum.
      if (selectedTarget && matchesTarget(query, selectedTarget)) {
        params.set(VIEWER_TARGET_PARAM, selectedTarget.slug);
      }
      startTransition(() => {
        navigate({ pathname: ROUTES.viewer, search: `?${params}` });
      });
    },
    [navigate, selectedTarget],
  );

  const chooseTarget = useCallback((entry: CatalogEntry) => {
    setSelectedTarget(entry);
    setFill((previous) => ({ values: coordinateValues(entry), nonce: (previous?.nonce ?? 0) + 1 }));
    setTab('coordinates');
  }, []);

  const form = (
    <CoordinateForm onSubmit={handleSubmit} initialValues={initialValues} isSubmitting={isNavigating} fill={fill} />
  );

  return (
    <PageContainer backTo={ROUTES.home}>
      <div className={styles.layout}>
        <header className={styles.intro}>
          <h1>Explore the Universe</h1>
          <p>Enter a position in the sky and choose which SPHEREx observation to visualize.</p>
          {UI_FEATURES.exploreModeSwitch ? (
            <ExploreModeSwitch current="coordinates" className={styles.modeSwitch} />
          ) : (
            <ButtonLink to={ROUTES.sky} variant="ghost" className={styles.mapLink}>
              Or select a point on the sky sphere
            </ButtonLink>
          )}
        </header>

        {SHOW_TARGETS_TAB ? (
          <div className={styles.tabs}>
            <div className={styles.tabList} role="tablist" aria-label="How to choose a position">
              <button
                type="button"
                role="tab"
                id="explore-tab-coordinates"
                aria-selected={tab === 'coordinates'}
                aria-controls="explore-panel-coordinates"
                onClick={() => setTab('coordinates')}
              >
                Celestial coordinates
              </button>
              <button
                type="button"
                role="tab"
                id="explore-tab-targets"
                aria-selected={tab === 'targets'}
                aria-controls="explore-panel-targets"
                onClick={() => setTab('targets')}
              >
                Mapped targets
                {catalog.targets.length > 0 && <span className={styles.count}>{catalog.targets.length}</span>}
              </button>
            </div>

            {/* The form stays mounted while hidden, so typed values survive switching tabs. */}
            <div
              role="tabpanel"
              id="explore-panel-coordinates"
              aria-labelledby="explore-tab-coordinates"
              hidden={tab !== 'coordinates'}
              className={styles.panel}
            >
              {selectedTarget && (
                <div className={styles.filled} role="status">
                  <span>
                    Coordinates of <strong>{selectedTarget.name}</strong>: its mapped images open right away.
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedTarget(null)}>
                    Dismiss
                  </Button>
                </div>
              )}
              {form}
            </div>
            <div
              role="tabpanel"
              id="explore-panel-targets"
              aria-labelledby="explore-tab-targets"
              hidden={tab !== 'targets'}
              className={styles.panel}
            >
              <KnownTargets onSelect={chooseTarget} selectedId={selectedTarget?.id ?? null} />
            </div>
          </div>
        ) : (
          form
        )}
      </div>
    </PageContainer>
  );
}

export default ExploreTheSky;
