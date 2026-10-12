import { describe, expect, it } from 'vitest';

import { buildSendableEmail } from './email-send';

describe('email send action url stubs', () => {
  it('injects accept-invite path into family invitation body', () => {
    const built = buildSendableEmail({
      template: 'family_invitation',
      locale: 'en',
      correlationId: 'corr_test',
      actionUrl: 'https://app.example.test/accept-invite/tok_opaque_abc12345',
    });
    expect(built.body).toContain('/accept-invite/tok_opaque_abc12345');
    expect(built.body).not.toMatch(/@example|mailto:/i);
  });
});
