import { describe, expect, it } from 'vitest';

import { inspectImageSize } from './inspect';
import { decodePng } from './png-codec';
import { sniffMime } from './sniff';
import { buildImageVariants } from './variants';
import { planPosterSource } from './mp4-poster';
import { probeMp4 } from './video-probe';

describe('adversarial media', () => {
  it('rejects a JPEG header pretending to be a PNG', () => {
    const spoofed = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(sniffMime(spoofed)).toBe('image/jpeg');
    expect(inspectImageSize(spoofed)).toBeNull();
  });

  it('does not decode a truncated PNG as a variant source', async () => {
    const truncated = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    expect(() => decodePng(truncated)).toThrow();
    const built = await buildImageVariants({
      projectId: '11111111-1111-4111-8111-111111111111',
      assetId: '22222222-2222-4222-8222-222222222222',
      bytes: truncated,
    });
    expect(built.variants).toEqual([]);
    expect(built.reject).toBe('undecodable');
  });

  it('rejects a truncated WebP header', async () => {
    const truncated = Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
    ]);
    expect(sniffMime(truncated)).toBe('image/webp');
    const built = await buildImageVariants({
      projectId: '11111111-1111-4111-8111-111111111111',
      assetId: '55555555-5555-4555-8555-555555555555',
      bytes: truncated,
    });
    expect(built.reject).toBe('undecodable');
  });

  it('does not decode a truncated JPEG as a variant source', async () => {
    const truncated = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x02]);
    expect(sniffMime(truncated)).toBe('image/jpeg');
    const built = await buildImageVariants({
      projectId: '11111111-1111-4111-8111-111111111111',
      assetId: '66666666-6666-4666-8666-666666666666',
      bytes: truncated,
    });
    expect(built.reject).toBe('undecodable');
  });

  it('does not invent a poster from an MP4 that only has an ftyp header', () => {
    const ftyp = new Uint8Array(24);
    ftyp.set([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d], 0);
    expect(sniffMime(ftyp)).toBe('video/mp4');
    expect(probeMp4(ftyp).hasVideo).toBe(false);
    expect(planPosterSource(ftyp)).toBe('unavailable');
  });
});
