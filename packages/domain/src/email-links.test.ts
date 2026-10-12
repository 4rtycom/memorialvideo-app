import { describe, expect, it } from 'vitest';

import { appendActionUrlToEmailBody, buildTransactionalActionUrl } from './email-links';

describe('transactional email action urls', () => {
  it('builds path-only accept URLs without emails', () => {
    const url = buildTransactionalActionUrl({
      appBaseUrl: 'https://app.example.test',
      kind: 'family_invite',
      opaqueSegment: 'tok_opaque_abc12345',
    });
    expect(url).toBe('https://app.example.test/accept-invite/tok_opaque_abc12345');
    expect(String(url)).not.toMatch(/@|mailto:/i);
  });

  it('rejects invalid base or segment', () => {
    expect(
      buildTransactionalActionUrl({
        appBaseUrl: 'not-a-url',
        kind: 'contributor_invite',
        opaqueSegment: 'abcdefgh',
      }),
    ).toEqual({ error: 'invalid_base' });
    expect(
      buildTransactionalActionUrl({
        appBaseUrl: 'http://127.0.0.1:3000',
        kind: 'private_screening',
        opaqueSegment: 'short',
      }),
    ).toEqual({ error: 'invalid_segment' });
    expect(
      buildTransactionalActionUrl({
        appBaseUrl: 'http://127.0.0.1:3000',
        kind: 'family_invite',
        opaqueSegment: 'has@email.example',
      }),
    ).toEqual({ error: 'invalid_segment' });
  });

  it('appends action url to email body once', () => {
    const once = appendActionUrlToEmailBody('Hello family.', 'https://app.test/accept-invite/abc');
    expect(once).toContain('/accept-invite/abc');
    const twice = appendActionUrlToEmailBody(once, 'https://app.test/accept-invite/abc');
    expect(twice.match(/accept-invite/g)?.length).toBe(1);
  });
});
