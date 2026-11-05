/**
 * MV-AUD-015 — professional depth stays available, but must not interrupt the
 * guided family route. Primary CTAs exclude Advanced Studio and related tools;
 * they surface only behind an optional “More control” disclosure.
 */

/** Stable deep-link route — keep reachable; do not put in primary family CTAs. */
export const ADVANCED_STUDIO_HREF = '/film/studio' as const;

/** Family-facing film actions that stay visible without expanding More control. */
export const FAMILY_FILM_PRIMARY_HREFS = [
  '/film/creating',
  '/film/edit',
  '/film/styles',
  '/ceremony',
  '/share',
] as const;

/** Surfaces that belong under optional More control on guided pages. */
export const ADVANCED_CONTROL_SURFACES = [
  'advanced_studio',
  'guided_variants',
  'render_job_metadata',
  'collaboration_inbox',
] as const;

export type AdvancedControlSurface = (typeof ADVANCED_CONTROL_SURFACES)[number];

export function isFamilyFilmPrimaryHref(href: string): boolean {
  return (FAMILY_FILM_PRIMARY_HREFS as readonly string[]).includes(href);
}

export function interruptsGuidedFamilyRoute(href: string): boolean {
  return href === ADVANCED_STUDIO_HREF || href.startsWith(`${ADVANCED_STUDIO_HREF}/`);
}
