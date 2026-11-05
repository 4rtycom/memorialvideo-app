import { describe, expect, it } from 'vitest';
import {
  ADVANCED_OPTIONAL,
  FAMILY_PRIMARY_NAV,
  FILM_NESTED,
  MEMORIES_NESTED,
  STABLE_DEEP_LINKS,
  familyPrimaryForPath,
  isAdvancedPath,
  isFamilyPrimaryHref,
} from '@/lib/family-nav';

describe('family-nav §4', () => {
  it('exposes exactly the five primary family tabs in order', () => {
    expect(FAMILY_PRIMARY_NAV.map((item) => item.label)).toEqual([
      'Overview',
      'Memories',
      'Music & Moments',
      'Your Film',
      'Ready for the Service',
    ]);
    expect(FAMILY_PRIMARY_NAV.map((item) => item.href)).toEqual([
      '/',
      '/memories',
      '/music',
      '/film',
      '/share',
    ]);
  });

  it('keeps Invite under Memories, not as a primary tab', () => {
    expect(FAMILY_PRIMARY_NAV.some((item) => item.href === '/contributors')).toBe(false);
    expect(MEMORIES_NESTED.map((item) => item.href)).toContain('/contributors');
    expect(MEMORIES_NESTED[0]?.label).toBe('Invite Family');
  });

  it('nests Life Story and Styles under Your Film', () => {
    expect(FAMILY_PRIMARY_NAV.some((item) => item.href === '/life-story')).toBe(false);
    expect(FILM_NESTED.map((item) => item.href)).toEqual(
      expect.arrayContaining(['/life-story', '/film/styles']),
    );
  });

  it('keeps Advanced Studio optional, not primary', () => {
    expect(FAMILY_PRIMARY_NAV.some((item) => item.href === '/film/studio')).toBe(false);
    expect(ADVANCED_OPTIONAL.map((item) => item.href)).toContain('/film/studio');
  });

  it('preserves stable deep links for reorganised destinations', () => {
    for (const href of [
      '/contributors',
      '/life-story',
      '/film/styles',
      '/film/studio',
      '/music',
      '/share',
    ]) {
      expect(STABLE_DEEP_LINKS).toContain(href);
    }
  });

  it('maps pathnames to the owning primary tab', () => {
    expect(familyPrimaryForPath('/')).toBe('/');
    expect(familyPrimaryForPath('/setup')).toBe('/');
    expect(familyPrimaryForPath('/workspace')).toBe('/');
    expect(familyPrimaryForPath('/memories')).toBe('/memories');
    expect(familyPrimaryForPath('/contributors')).toBe('/memories');
    expect(familyPrimaryForPath('/contributors/review')).toBe('/memories');
    expect(familyPrimaryForPath('/music')).toBe('/music');
    expect(familyPrimaryForPath('/film')).toBe('/film');
    expect(familyPrimaryForPath('/film/edit')).toBe('/film');
    expect(familyPrimaryForPath('/life-story')).toBe('/film');
    expect(familyPrimaryForPath('/film/studio')).toBe('/film');
    expect(familyPrimaryForPath('/ceremony')).toBe('/film');
    expect(familyPrimaryForPath('/share')).toBe('/share');
    expect(familyPrimaryForPath('/account')).toBe(null);
  });

  it('detects Advanced paths and primary hrefs', () => {
    expect(isAdvancedPath('/film/studio')).toBe(true);
    expect(isAdvancedPath('/film/enhance')).toBe(true);
    expect(isAdvancedPath('/film')).toBe(false);
    expect(isFamilyPrimaryHref('/film')).toBe(true);
    expect(isFamilyPrimaryHref('/contributors')).toBe(false);
  });
});
