/**
 * Family primary navigation — audit §4 (app-audit-2026-10-27).
 *
 * Overview | Memories | Music & Moments | Your Film | Ready for the Service
 * Invite Family lives inside Memories; Life Story + Styles inside Your Film;
 * Advanced Studio stays optional. Stable deep links are preserved.
 */

export const FAMILY_PRIMARY_NAV = [
  { href: '/', label: 'Overview', icon: '⌂' },
  { href: '/memories', label: 'Memories', icon: '▦' },
  { href: '/music', label: 'Music & Moments', icon: '♫' },
  { href: '/film', label: 'Your Film', icon: '▷' },
  { href: '/share', label: 'Ready for the Service', icon: '↓' },
] as const;

export type FamilyPrimaryHref = (typeof FAMILY_PRIMARY_NAV)[number]['href'];

/** Nested under Memories (not a primary tab). */
export const MEMORIES_NESTED = [
  { href: '/contributors', label: 'Invite Family' },
  { href: '/contributors/review', label: 'Review contributions' },
] as const;

/** Nested under Your Film (guided family path). */
export const FILM_NESTED = [
  { href: '/life-story', label: 'Life Story' },
  { href: '/film/styles', label: 'Styles' },
  { href: '/film/creating', label: 'Arrange first film' },
  { href: '/film/edit', label: 'Edit story' },
] as const;

/** Optional Advanced — not in the primary family strip. */
export const ADVANCED_OPTIONAL = [
  { href: '/film/studio', label: 'Advanced Studio' },
  { href: '/film/enhance', label: 'Enhance' },
] as const;

/** Routes that remain deep-linkable after the visual nav reorganisation. */
export const STABLE_DEEP_LINKS = [
  '/',
  '/setup',
  '/workspace',
  '/memories',
  '/contributors',
  '/contributors/review',
  '/guest',
  '/life-story',
  '/film',
  '/film/styles',
  '/film/creating',
  '/film/edit',
  '/film/studio',
  '/film/enhance',
  '/music',
  '/share',
  '/ceremony',
  '/account',
] as const;

export function isFamilyPrimaryHref(href: string): href is FamilyPrimaryHref {
  return FAMILY_PRIMARY_NAV.some((item) => item.href === href);
}

/** Which primary tab owns a pathname (for active styling). */
export function familyPrimaryForPath(pathname: string): FamilyPrimaryHref | null {
  if (pathname === '/' || pathname === '/setup' || pathname === '/workspace') {
    return '/';
  }
  if (
    pathname === '/memories' ||
    pathname.startsWith('/memories/') ||
    pathname === '/contributors' ||
    pathname.startsWith('/contributors/')
  ) {
    return '/memories';
  }
  if (pathname === '/music' || pathname.startsWith('/music/')) {
    return '/music';
  }
  if (
    pathname === '/film' ||
    pathname.startsWith('/film/') ||
    pathname === '/life-story' ||
    pathname.startsWith('/life-story/') ||
    pathname === '/ceremony' ||
    pathname.startsWith('/ceremony/')
  ) {
    return '/film';
  }
  if (pathname === '/share' || pathname.startsWith('/share/')) {
    return '/share';
  }
  return null;
}

export function isAdvancedPath(pathname: string): boolean {
  return ADVANCED_OPTIONAL.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}
