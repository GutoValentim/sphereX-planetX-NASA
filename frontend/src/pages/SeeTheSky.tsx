import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import ButtonLink from '../components/common/ButtonLink';
import EmptyState from '../components/common/EmptyState';
import PageContainer from '../components/layout/PageContainer';
import ObservationWorkspace from '../components/viewer/ObservationWorkspace';
import { ROUTES, VIEWER_ENTRY_MAP, type RouteTarget } from '../routes/paths';
import { fromQueryParams, toQueryParams } from '../utils/observationQueryParams';
import styles from './SeeTheSky.module.css';

function SeeTheSky() {
  const [searchParams] = useSearchParams();
  const query = useMemo(() => fromQueryParams(searchParams), [searchParams]);

  const fromSkyMap = searchParams.get('entry') === VIEWER_ENTRY_MAP;
  const exploreTarget: RouteTarget = fromSkyMap
    ? ROUTES.sky
    : query
      ? { pathname: ROUTES.explore, search: `?${toQueryParams(query)}` }
      : ROUTES.explore;

  if (!query) {
    return (
      <PageContainer title="SPHEREx Image" backTo={exploreTarget}>
        <EmptyState
          titleAs="h2"
          title="No sky region selected"
          message="Choose celestial coordinates and an observation date to visualize SPHEREx data."
          action={
            <ButtonLink to={exploreTarget}>
              {fromSkyMap ? 'Go to the sky sphere' : 'Go to Explore the Universe'} <span aria-hidden="true">→</span>
            </ButtonLink>
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer title="SPHEREx Image" backTo={exploreTarget}>
      <ObservationWorkspace key={searchParams.toString()} query={query} />
      <div className={styles.actions}>
        <ButtonLink to={exploreTarget} size="lg">
          Explore Again <span aria-hidden="true">→</span>
        </ButtonLink>
      </div>
    </PageContainer>
  );
}

export default SeeTheSky;
