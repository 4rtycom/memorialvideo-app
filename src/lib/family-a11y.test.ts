import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { creatorT, draftCreatorLocales } from '@/lib/creator-ui-messages';
import {
  FAMILY_PRIMARY_NAV_HREFS,
  FAMILY_PRIMARY_ROUTES,
  isFamilyPrimaryPath,
} from '@/lib/family-a11y';
import { navItems } from '@/lib/copy';

const ROOT = path.resolve(import.meta.dirname, '..');

describe('Gate B family a11y inventory', () => {
  it('keeps primary nav destinations aligned with AppShell items', () => {
    expect(navItems.map((item) => item.href)).toEqual([...FAMILY_PRIMARY_NAV_HREFS]);
  });

  it('recognizes family primary paths including nested film routes', () => {
    expect(isFamilyPrimaryPath('/')).toBe(true);
    expect(isFamilyPrimaryPath('/memories')).toBe(true);
    expect(isFamilyPrimaryPath('/film/edit')).toBe(true);
    expect(isFamilyPrimaryPath('/guest/upload')).toBe(true);
    expect(isFamilyPrimaryPath('/states')).toBe(false);
    expect(isFamilyPrimaryPath('/m')).toBe(false);
  });

  it('ships skip / nav a11y strings for every launch locale', () => {
    const keys = [
      'creator.a11y.skip',
      'creator.a11y.navPrimary',
      'creator.a11y.navMobile',
      'creator.a11y.account',
    ] as const;
    for (const language of ['en', ...draftCreatorLocales()] as const) {
      for (const key of keys) {
        const value = creatorT(language, key);
        expect(value.length).toBeGreaterThan(0);
        expect(value).not.toBe(key);
      }
    }
    for (const language of draftCreatorLocales()) {
      expect(creatorT(language, 'creator.a11y.skip')).not.toBe(creatorT('en', 'creator.a11y.skip'));
    }
  });

  it('wires skip link, main landmark, mobile nav, and reduced-motion in shell CSS', () => {
    const css = readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8');
    expect(css).toContain('.skip-link');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('.primary-nav-mobile');
    expect(css).not.toContain('overflow-x: auto');
    expect(css).toContain('grid-template-areas:');
    expect(css).toContain('.save-status');
    expect(css).toContain('repeat(2, minmax(0, 1fr))');

    const shell = readFileSync(path.join(ROOT, 'components/AppShell.tsx'), 'utf8');
    expect(shell).toContain('href="#main"');
    expect(shell).toContain('id="main"');
    expect(shell).toContain('primary-nav-mobile');
    expect(shell).toContain('aria-current');
    expect(shell).toContain('creator.a11y.skip');

    const guestShell = readFileSync(path.join(ROOT, 'components/GuestShell.tsx'), 'utf8');
    expect(guestShell).toContain('href="#main"');
  });

  it('lists the audited family primary routes for Gate B', () => {
    expect(FAMILY_PRIMARY_ROUTES).toContain('/');
    expect(FAMILY_PRIMARY_ROUTES).toContain('/music');
    expect(FAMILY_PRIMARY_ROUTES).toContain('/share');
    expect(FAMILY_PRIMARY_ROUTES).toContain('/ceremony');
    expect(FAMILY_PRIMARY_ROUTES).toContain('/guest');
  });
});
