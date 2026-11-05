import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { convertHeicBufferToJpeg } from './heic-convert';
import { sniffMediaBytes, sniffedMatchesDeclared } from './media-storage';

const FIXTURE = path.join(process.cwd(), 'src/server/__fixtures__/sample.heic');

describe('HEIC server conversion', () => {
  it('sniffs HEIC ftyp brands (mif1 + heic) instead of calling them mp4', async () => {
    const bytes = await readFile(FIXTURE);
    expect(sniffMediaBytes(bytes)).toBe('image/heic');
    expect(sniffedMatchesDeclared('image/heic', 'image/heic')).toBe(true);
    expect(sniffedMatchesDeclared('image/heif', 'image/heic')).toBe(true);
    expect(sniffedMatchesDeclared('application/octet-stream', 'image/heic')).toBe(true);
  });

  it('converts fixture HEIC to a real JPEG', async () => {
    const bytes = await readFile(FIXTURE);
    const result = await convertHeicBufferToJpeg(bytes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.jpeg[0]).toBe(0xff);
    expect(result.jpeg[1]).toBe(0xd8);
    expect(result.jpeg[2]).toBe(0xff);
    expect(result.byteSize).toBeGreaterThan(1_000);
    expect(sniffMediaBytes(result.jpeg)).toBe('image/jpeg');
  });

  it('rejects non-HEIC bytes honestly', async () => {
    const result = await convertHeicBufferToJpeg(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    expect(result.ok).toBe(false);
  });
});
