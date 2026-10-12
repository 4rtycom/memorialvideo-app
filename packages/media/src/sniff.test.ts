import { describe, expect, it } from 'vitest';

import { headerFromHex, mimeMatchesDeclaration, sniffMime } from './sniff';

describe('media sniff', () => {
  it('detects JPEG and rejects a spoofed HEIC header', () => {
    expect(sniffMime(headerFromHex('ffd8ffe000104a464946'))).toBe('image/jpeg');
    expect(sniffMime(headerFromHex('000000186674797068656963'))).not.toBe('image/jpeg');
    expect(mimeMatchesDeclaration('image/jpeg', 'image/heic')).toBe(false);
  });

  it('detects PNG, WebP and MP4 brands', () => {
    expect(sniffMime(headerFromHex('89504e470d0a1a0a0000'))).toBe('image/png');
    expect(sniffMime(headerFromHex('52494646aaaaaaaa57454250'))).toBe('image/webp');
    expect(sniffMime(headerFromHex('000000186674797069736f6d'))).toBe('video/mp4');
  });
});
