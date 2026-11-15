export const ROUTES = {
  home: '/',
  explore: '/explore',
  sky: '/explore-map',
  viewer: '/viewer',
} as const;

/** Query flag set when the viewer was opened from the sky sphere. It does not change the observation. */
export const VIEWER_ENTRY_MAP = 'map';

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];

/** An app route, optionally with a query string (e.g. to carry an exploration query). */
export type RouteTarget = AppRoute | { pathname: AppRoute; search?: string };

/** Query parameter with the slug of a pre-mapped target; the viewer then reads the lab export. */
export const VIEWER_TARGET_PARAM = 'target';
