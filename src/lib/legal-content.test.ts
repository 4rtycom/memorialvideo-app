import { afterEach, describe, expect, it } from 'vitest';
import { LEGAL_PAGES, supportEmail } from './legal-content';

describe('legal content', () => {
  const original = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
    else process.env.NEXT_PUBLIC_SUPPORT_EMAIL = original;
  });

  it('has sections for privacy, terms and cookies', () => {
    for (const key of ['privacy', 'terms', 'cookies'] as const) {
      expect(LEGAL_PAGES[key].sections.length).toBeGreaterThan(1);
    }
  });

  it('only exposes a valid support address', () => {
    delete process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
    expect(supportEmail()).toBeNull();
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL = 'not an email';
    expect(supportEmail()).toBeNull();
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL = ' help@example.com ';
    expect(supportEmail()).toBe('help@example.com');
  });
});
