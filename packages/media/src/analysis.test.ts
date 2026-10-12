import { describe, expect, it } from 'vitest';

import { inspectStoredMedia, isLikelyDuplicate, LIKELY_DUPLICATE_THRESHOLD, likelyDuplicateScore } from './analysis';
import { encodeJpeg } from './jpeg-codec';
import { averageHash } from './pixels';
import { encodePng } from './png-codec';

function solid(width: number, height: number, color: [number, number, number, number]) {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data.set(color, index * 4);
  }
  return { width, height, data };
}

function checker(width: number, height: number) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const on = ((x >> 3) + (y >> 3)) % 2 === 0;
      const offset = (y * width + x) * 4;
      data.set(on ? [220, 200, 160, 255] : [40, 50, 60, 255], offset);
    }
  }
  return { width, height, data };
}

describe('media inspection', () => {
  it('extracts JPEG dimensions and quality suggestions without treating them as facts', async () => {
    const sharp = await inspectStoredMedia(encodeJpeg(checker(800, 600)));
    expect(sharp.media.mediaKind).toBe('photo');
    if (sharp.media.mediaKind === 'photo') {
      expect(sharp.media.width).toBe(800);
      expect(sharp.media.height).toBe(600);
    }
    expect(sharp.candidates.every((item) => item.status === 'uncertain')).toBe(true);
  });

  it('flags a dark solid image as a suggestion, not unusable', async () => {
    const dark = await inspectStoredMedia(encodePng(solid(800, 600, [4, 4, 4, 255])));
    expect(dark.quality.some((item) => item.code === 'dark_exposure' && item.severity === 'suggestion')).toBe(true);
    expect(dark.quality.some((item) => item.code === 'soft_focus')).toBe(true);
  });

  it('flags an overexposed image as a suggestion', async () => {
    const bright = await inspectStoredMedia(encodePng(solid(800, 600, [252, 252, 252, 255])));
    expect(bright.quality.some((item) => item.code === 'bright_exposure' && item.severity === 'suggestion')).toBe(true);
  });

  it('returns a safe partial result for unsupported bytes', async () => {
    const result = await inspectStoredMedia(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(result.media.mediaKind).toBe('unsupported');
    expect(result.partial).toBe(true);
    expect(result.quality[0]?.code).toBe('unsupported_type');
  });

  it('detects exact checksum duplicates independently of any filename', async () => {
    const bytes = encodePng(checker(320, 240));
    const first = await inspectStoredMedia(bytes);
    const second = await inspectStoredMedia(bytes.slice());
    expect(first.checksum).toBe(second.checksum);
  });

  it('scores visually similar but byte-different images as likely, unconfirmed matches', async () => {
    const left = checker(320, 240);
    const right = checker(320, 240);
    right.data[0] = 210;
    const a = averageHash(left);
    const b = averageHash(right);
    expect(isLikelyDuplicate(a, b)).toBe(true);
    expect(likelyDuplicateScore(a, b)).toBeGreaterThanOrEqual(LIKELY_DUPLICATE_THRESHOLD);
  });

  it('treats average-hash distance 8 as likely and 9 as not', () => {
    const left = '0000000000000000';
    const atThreshold = '00000000000000ff';
    const beyond = '00000000000001ff';
    expect(isLikelyDuplicate(left, atThreshold)).toBe(true);
    expect(isLikelyDuplicate(left, beyond)).toBe(false);
  });

  it('probes a constructed MP4 without inventing near-duplicate hashes', async () => {
    const ftyp = new Uint8Array(24);
    ftyp.set([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d], 0);
    const mvhd = new Uint8Array(24);
    writeUint32BE(mvhd, 12, 1000);
    writeUint32BE(mvhd, 16, 2500);
    const vide = new Uint8Array(16);
    vide.set([0x76, 0x69, 0x64, 0x65], 8);
    const moov = mp4Box('moov', concatBoxes([mp4Box('mvhd', mvhd), mp4Box('trak', mp4Box('mdia', mp4Box('hdlr', vide)))]));
    const result = await inspectStoredMedia(concatBoxes([ftyp, moov]));
    expect(result.media.mediaKind).toBe('video');
    if (result.media.mediaKind === 'video') {
      expect(result.media.durationMs).toBe(2500);
      expect(result.media.hasAudio).toBe(false);
    }
    expect(result.perceptualHash).toBeNull();
    expect(result.quality.some((item) => item.code === 'missing_audio' && item.severity === 'information')).toBe(true);
  });

  it('inspects WAV duration and silence without requiring ingest audio uploads', async () => {
    const wav = silentWav();
    const result = await inspectStoredMedia(wav);
    expect(result.media.mediaKind).toBe('audio');
    if (result.media.mediaKind === 'audio') {
      expect(result.media.sampleRate).toBe(8000);
      expect(result.media.channels).toBe(1);
    }
    expect(result.quality.some((item) => item.code === 'near_silence')).toBe(true);
  });
});

function silentWav(): Uint8Array {
  const samples = 8000;
  const data = new Uint8Array(44 + samples * 2);
  data.set([0x52, 0x49, 0x46, 0x46], 0);
  write32(data, 4, 36 + samples * 2);
  data.set([0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20], 8);
  write32(data, 16, 16);
  data[20] = 1;
  data[22] = 1;
  write32(data, 24, 8000);
  write32(data, 28, 16000);
  data[32] = 2;
  data[34] = 16;
  data.set([0x64, 0x61, 0x74, 0x61], 36);
  write32(data, 40, samples * 2);
  return data;
}

function write32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
  bytes[offset + 2] = (value >> 16) & 0xff;
  bytes[offset + 3] = (value >> 24) & 0xff;
}

function writeUint32BE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function mp4Box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length);
  writeUint32BE(out, 0, 8 + payload.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(payload, 8);
  return out;
}

function concatBoxes(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
