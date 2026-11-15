import { useCallback, useTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import SkySphere from '../components/sky-map/SkySphere';
import PageContainer from '../components/layout/PageContainer';
import { DEFAULT_SPECTRAL_BAND } from '../constants/spectralBands';
import { ROUTES, VIEWER_ENTRY_MAP } from '../routes/paths';
import type { SkySelection } from '../components/sky-map/skySphereRenderer';
import { toQueryParams } from '../utils/observationQueryParams';


function ExploreMap() {
  const [isOpeningViewer, startTransition] = useTransition();
  const navigate = useNavigate();

  const openViewer = useCallback(
    (selection: SkySelection) => {
      const params = toQueryParams({
        raDeg: selection.raDeg,
        decDeg: selection.decDeg,
        band: DEFAULT_SPECTRAL_BAND,
        observationDate: null,
      });
      params.set('entry', VIEWER_ENTRY_MAP);
      startTransition(() => {
        navigate({ pathname: ROUTES.viewer, search: `?${params}` });
      });
    },
    [navigate],
  );

  return (
    <PageContainer width="full" backTo={ROUTES.home}>
      <h1 className="visually-hidden">Explore the sky</h1>
      <SkySphere onOpenViewer={openViewer} isOpeningViewer={isOpeningViewer} />
    </PageContainer>
  );
}

export default ExploreMap;
