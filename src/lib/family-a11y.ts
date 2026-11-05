/**
 * Family primary routes for Gate B keyboard / focus / reduced-motion a11y.
 * Matches audit IA: Overview | Memories | Music | Film | Ready for the Service
 * plus setup/workspace and guest contribution.
 */
export const FAMILY_PRIMARY_ROUTES = [
  '/',
  '/setup',
  '/workspace',
  '/memories',
  '/contributors',
  '/life-story',
  '/film',
  '/film/styles',
  '/film/creating',
  '/film/edit',
  '/music',
  '/share',
  '/ceremony',
  '/guest',
  '/sign-in',
  '/account',
] as const;

export type FamilyPrimaryRoute = (typeof FAMILY_PRIMARY_ROUTES)[number];

/** Sidebar / mobile chrome destinations (stable deep links). */
export const FAMILY_PRIMARY_NAV_HREFS = [
  '/',
  '/memories',
  '/contributors',
  '/life-story',
  '/film',
  '/music',
  '/share',
] as const;

export function isFamilyPrimaryPath(pathname: string): boolean {
  return FAMILY_PRIMARY_ROUTES.some(
    (route) => pathname === route || (route !== '/' && pathname.startsWith(`${route}/`)),
  );
}
