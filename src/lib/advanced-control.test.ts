import { describe, expect, it } from 'vitest';
import {
  ADVANCED_STUDIO_HREF,
  FAMILY_FILM_PRIMARY_HREFS,
  interruptsGuidedFamilyRoute,
  isFamilyFilmPrimaryHref,
} from './advanced-control';

describe('advanced-control (MV-AUD-015)', () => {
  it('keeps Advanced Studio off the primary family film CTA list', () => {
    expect(FAMILY_FILM_PRIMARY_HREFS).not.toContain(ADVANCED_STUDIO_HREF);
    expect(isFamilyFilmPrimaryHref(ADVANCED_STUDIO_HREF)).toBe(false);
    expect(interruptsGuidedFamilyRoute(ADVANCED_STUDIO_HREF)).toBe(true);
  });

  it('treats guided edit, atmosphere, ceremony and share as primary', () => {
    for (const href of FAMILY_FILM_PRIMARY_HREFS) {
      expect(isFamilyFilmPrimaryHref(href)).toBe(true);
      expect(interruptsGuidedFamilyRoute(href)).toBe(false);
    }
  });

  it('preserves the studio deep-link path for More control / operators', () => {
    expect(ADVANCED_STUDIO_HREF).toBe('/film/studio');
    expect(interruptsGuidedFamilyRoute('/film/studio/extra')).toBe(true);
  });
});
