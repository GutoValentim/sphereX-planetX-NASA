export const ROUTES = {
  home: '/',
  explore: '/explore',
  viewer: '/viewer',
} as const;

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];

/** An app route, optionally with a query string (e.g. to carry an exploration query). */
export type RouteTarget = AppRoute | { pathname: AppRoute; search?: string };
