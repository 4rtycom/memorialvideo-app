import { describe, expect, it } from 'vitest';

import { generateShareToken, hashToken, tokensMatch } from './tokens.js';

describe('share tokens', () => {
  it('never returns the plaintext from the hash helper', () => {
    const token = generateShareToken();
    const hash = hashToken(token, 'test-pepper-value-1');
    expect(hash).not.toContain(token);
    expect(hash).toHaveLength(64);
    expect(tokensMatch(token, 'test-pepper-value-1', hash)).toBe(true);
    expect(tokensMatch(token, 'other-pepper-value-1', hash)).toBe(false);
  });

  it('rejects short tokens and peppers', () => {
    expect(() => hashToken('short', 'test-pepper-value-1')).toThrow();
    expect(() => hashToken(generateShareToken(), 'short')).toThrow();
  });
});
