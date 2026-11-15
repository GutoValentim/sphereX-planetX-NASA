import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import ParallaxWallpaper, { WallpaperClouds } from './assets/wallpapers/ParallaxWallpaper';
import LoadingState from './components/common/LoadingState';
import PageContainer from './components/layout/PageContainer';
import Home from './pages/Home';
import ExploreTheSky from './pages/ExploreTheSky';
import NotFound from './pages/NotFound';
import { ROUTES } from './routes/paths';
import ScrollToTop from './routes/ScrollToTop';

/** The viewer page pulls in the sky viewer and chart integrations, so it is loaded on demand. */
const SeeTheSky = lazy(() => import('./pages/SeeTheSky'));
const ExploreMap = lazy(() => import('./pages/ExploreMap'));

/** Routes that keep the plain page color (--color-page) instead of the parallax wallpaper. */
const SOLID_BACKGROUND_ROUTES: readonly string[] = [ROUTES.viewer];

function SiteWallpaper() {
  const { pathname } = useLocation();
  return SOLID_BACKGROUND_ROUTES.includes(pathname) ? null : <ParallaxWallpaper />;
}

function SiteClouds() {
  const { pathname } = useLocation();
  return SOLID_BACKGROUND_ROUTES.includes(pathname) ? null : <WallpaperClouds />;
}

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <div id="hero-backdrop" className="hero-backdrop" />
      <SiteWallpaper />
      <div className="parallax-content">
        <SiteClouds />
        <Suspense
          fallback={
            <PageContainer>
              <LoadingState message="Loading page…" />
            </PageContainer>
          }
        >
          <Routes>
            <Route path={ROUTES.home} element={<Home />} />
            <Route path={ROUTES.explore} element={<ExploreTheSky />} />
            <Route path={ROUTES.sky} element={<ExploreMap />} />
            <Route path={ROUTES.viewer} element={<SeeTheSky />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </div>
    </BrowserRouter>
  );
}

export default App;
