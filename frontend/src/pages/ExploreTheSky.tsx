import { useCallback, useMemo, useTransition } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ButtonLink from '../components/common/ButtonLink';
import CoordinateForm from '../components/explore/CoordinateForm';
import PageContainer from '../components/layout/PageContainer';
import { ROUTES } from '../routes/paths';
import type { ObservationQuery } from '../types/observation';
import { formValuesFromQuery } from '../utils/exploreFormMapping';
import { fromQueryParams, toQueryParams } from '../utils/observationQueryParams';
import styles from './ExploreTheSky.module.css';

function ExploreTheSky() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Keeps this page visible, with a busy button, while the lazily loaded viewer page downloads.
  const [isNavigating, startTransition] = useTransition();

  const initialValues = useMemo(() => {
    const previousQuery = fromQueryParams(searchParams);
    return previousQuery ? formValuesFromQuery(previousQuery) : undefined;
  }, [searchParams]);

  const handleSubmit = useCallback(
    (query: ObservationQuery) => {
      startTransition(() => {
        navigate({ pathname: ROUTES.viewer, search: `?${toQueryParams(query)}` });
      });
    },
    [navigate],
  );

  return (
    <PageContainer backTo={ROUTES.home}>
      <div className={styles.layout}>
        <header className={styles.intro}>
          <h1>Explore the Universe</h1>
          <p>Enter a position in the sky and choose which SPHEREx observation to visualize.</p>
          <ButtonLink to={ROUTES.sky} variant="ghost" className={styles.mapLink}>
            Or select a point on the sky sphere
          </ButtonLink>
        </header>
        <CoordinateForm onSubmit={handleSubmit} initialValues={initialValues} isSubmitting={isNavigating} />
      </div>
    </PageContainer>
  );
}

export default ExploreTheSky;
