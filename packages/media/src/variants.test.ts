import { describe, expect, it } from 'vitest';

import { inspectImageSize, proposeDuplicates, qualityFlags, sha256Hex } from './inspect';
import { averageHash, hammingHex } from './pixels';
import { decodePng, encodePng } from './png-codec';
import { extractEmbeddedJpeg, extractFirstMjpegSample, planPosterSource } from './mp4-poster';
import { encodeLossyWebp } from './lossy-webp';
import { encodeLosslessWebp } from './webp-codec';
import { encodeJpeg } from './jpeg-codec';
import { buildImageVariants, buildPosterFromJpegBytes, decodeRaster } from './variants';
import { probeMp4, videoQualityFlags } from './video-probe';
import { inspectWebpSize } from './webp-size';
import { EXAMPLE_STYLE_KEYS, renderExampleStyleFrame } from './example-frame';
import { buildStoreZip } from './zip';

function solidPng(width: number, height: number, color: [number, number, number, number]): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data.set(color, index * 4);
  }
  return encodePng({ width, height, data });
}

function patternPng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number, number],
): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data.set(pixel(x, y), (y * width + x) * 4);
    }
  }
  return encodePng({ width, height, data });
}

function mp4Box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length);
  const size = out.length;
  out[0] = (size >>> 24) & 0xff;
  out[1] = (size >>> 16) & 0xff;
  out[2] = (size >>> 8) & 0xff;
  out[3] = size & 0xff;
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(payload, 8);
  return out;
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

describe('image variants', () => {
  it('builds thumbnail, preview and normalized PNG variants and a perceptual hash', async () => {
    const source = solidPng(1600, 900, [12, 80, 160, 255]);
    const built = await buildImageVariants({
      projectId: '11111111-1111-4111-8111-111111111111',
      assetId: '22222222-2222-4222-8222-222222222222',
      bytes: source,
    });
    expect(built.skipped).toEqual([]);
    expect(built.variants.map((item) => item.variantType)).toEqual(['thumbnail', 'preview', 'normalized']);
    expect(built.variants[0]?.width).toBe(320);
    expect(built.variants[0]?.height).toBe(180);
    expect(built.variants[2]?.width).toBe(1600);
    expect(built.perceptualHash).toHaveLength(16);
    const decoded = decodePng(built.variants[0]!.bytes);
    expect(decoded.width).toBe(320);
    expect(inspectImageSize(source)).toEqual({ width: 1600, height: 900 });
  });

  it('roundtrips PNG pixels and flags near-duplicates without deleting', () => {
    const left = decodeRaster(patternPng(32, 32, (x, y) => [x * 8, y * 4, 40, 255]));
    const right = decodeRaster(patternPng(32, 32, (x, y) => [x * 8, y * 4, 48, 255]));
    const distant = decodeRaster(patternPng(32, 32, (x, y) => [(x + y) % 2 === 0 ? 255 : 0, 0, 0, 255]));
    expect(hammingHex(averageHash(left), averageHash(right))).toBeLessThan(8);
    expect(hammingHex(averageHash(left), averageHash(distant))).toBeGreaterThan(8);
    expect(
      proposeDuplicates({
        sha256: sha256Hex(solidPng(8, 8, [1, 2, 3, 255])),
        existing: [{ id: 'same', sha256: sha256Hex(solidPng(8, 8, [1, 2, 3, 255])) }],
      }),
    ).toEqual(['same']);
  });

  it('builds variants from a lossless WebP photograph', async () => {
    const pixels = {
      width: 16,
      height: 12,
      data: new Uint8Array(16 * 12 * 4),
    };
    for (let index = 0; index < 16 * 12; index += 1) {
      pixels.data.set([index, 40, 80, 255], index * 4);
    }
    const webp = encodeLosslessWebp(pixels);
    const built = await buildImageVariants({
      projectId: '11111111-1111-4111-8111-111111111111',
      assetId: '33333333-3333-4333-8333-333333333333',
      bytes: webp,
    });
    expect(built.reject).toBeUndefined();
    expect(built.variants).toHaveLength(3);
    expect(built.perceptualHash).toHaveLength(16);
  });

  it('reads WebP VP8X canvas size', () => {
    const bytes = new Uint8Array(30);
    bytes.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58], 0);
    bytes[24] = 99;
    bytes[27] = 49;
    expect(inspectWebpSize(bytes)).toEqual({ width: 100, height: 50 });
  });

  it('builds variants from a lossy VP8 WebP photograph', async () => {
    const pixels = {
      width: 16,
      height: 12,
      data: new Uint8Array(16 * 12 * 4),
    };
    for (let index = 0; index < 16 * 12; index += 1) {
      pixels.data.set([(index * 17) % 255, 40, 80, 255], index * 4);
    }
    const webp = await encodeLossyWebp(pixels, 70);
    expect(webp[15]).toBe(0x20);
    const built = await buildImageVariants({
      projectId: '11111111-1111-4111-8111-111111111111',
      assetId: '44444444-4444-4444-8444-444444444444',
      bytes: webp,
    });
    expect(built.reject).toBeUndefined();
    expect(built.variants).toHaveLength(3);
    expect(built.perceptualHash).toHaveLength(16);
  });
});

describe('video probe', () => {
  it('reads duration, dimensions and audio from constructed MP4 boxes', () => {
    const mvhd = new Uint8Array(24);
    writeUint32(mvhd, 12, 1000);
    writeUint32(mvhd, 16, 12_000);
    const tkhd = new Uint8Array(84);
    writeUint32(tkhd, 76, 1280 << 16);
    writeUint32(tkhd, 80, 720 << 16);
    const vide = new Uint8Array(16);
    vide.set([0x76, 0x69, 0x64, 0x65], 8);
    const soun = new Uint8Array(16);
    soun.set([0x73, 0x6f, 0x75, 0x6e], 8);
    const bytes = mp4Box(
      'moov',
      concat([
        mp4Box('mvhd', mvhd),
        mp4Box('trak', concat([mp4Box('tkhd', tkhd), mp4Box('mdia', mp4Box('hdlr', vide))])),
        mp4Box('trak', mp4Box('mdia', mp4Box('hdlr', soun))),
      ]),
    );
    const probe = probeMp4(bytes);
    expect(probe.durationMs).toBe(12_000);
    expect(probe.width).toBe(1280);
    expect(probe.height).toBe(720);
    expect(probe.hasVideo).toBe(true);
    expect(probe.hasAudio).toBe(true);
    expect(videoQualityFlags(probe).noAudio).toBe(false);
    expect(qualityFlags({ width: 1280, height: 720 }).lowResolution).toBe(false);
  });

  it('plans an H.264 extract when the sample entry is avc1 and no still exists', () => {
    const stsd = new Uint8Array(24);
    writeUint32(stsd, 4, 1);
    writeUint32(stsd, 8, 16);
    stsd.set([0x61, 0x76, 0x63, 0x31], 12);
    const bytes = mp4Box(
      'moov',
      mp4Box('trak', mp4Box('mdia', mp4Box('minf', mp4Box('stbl', mp4Box('stsd', stsd))))),
    );
    expect(probeMp4(bytes).codec).toBe('avc1');
    expect(planPosterSource(bytes)).toBe('h264_extract');
  });

  it('builds a derived poster from a JPEG still without mutating the source bytes', () => {
    const jpeg = encodeJpeg({
      width: 8,
      height: 8,
      data: new Uint8Array(8 * 8 * 4).fill(120),
    });
    const original = jpeg.slice();
    const poster = buildPosterFromJpegBytes({
      projectId: 'p1',
      assetId: 'a1',
      jpeg,
      provenance: {
        sourceMethod: 'h264_extract',
        provider: 'remotion',
        providerModel: 'renderStill',
        providerVersion: '4.0.518',
      },
    });
    expect(poster.variantType).toBe('poster');
    expect(poster.provenance?.sourceMethod).toBe('h264_extract');
    expect(jpeg).toEqual(original);
  });
});

describe('mp4 poster', () => {
  it('extracts an embedded JPEG from an MP4-shaped box', () => {
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3, 4, 0xff, 0xd9]);
    const payload = new Uint8Array(8 + jpeg.length);
    payload.set(jpeg, 8);
    const box = mp4Box('covr', payload);
    expect(extractEmbeddedJpeg(box)?.byteLength).toBe(jpeg.length);
    expect(planPosterSource(box)).toBe('embedded_jpeg');
  });

  it('extracts the first MJPEG sample when no cover still exists', () => {
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3, 4, 5, 6, 0xff, 0xd9]);
    const mdat = mp4Box('mdat', jpeg);
    const stsdPayload = new Uint8Array(24);
    writeUint32(stsdPayload, 4, 1);
    writeUint32(stsdPayload, 8, 16);
    stsdPayload.set([0x6a, 0x70, 0x65, 0x67], 12);
    const stszPayload = new Uint8Array(12);
    writeUint32(stszPayload, 4, jpeg.length);
    writeUint32(stszPayload, 8, 1);
    const stcoPayload = new Uint8Array(12);
    writeUint32(stcoPayload, 4, 1);
    writeUint32(stcoPayload, 8, 8);
    const file = concat([
      mdat,
      mp4Box(
        'moov',
        mp4Box(
          'trak',
          mp4Box(
            'mdia',
            mp4Box('minf', mp4Box('stbl', concat([mp4Box('stsd', stsdPayload), mp4Box('stsz', stszPayload), mp4Box('stco', stcoPayload)]))),
          ),
        ),
      ),
    ]);
    expect(extractFirstMjpegSample(file)?.byteLength).toBe(jpeg.length);
    expect(planPosterSource(file)).toBe('mjpeg_sample');
  });
});

describe('example style frames', () => {
  it('renders synthetic theme stills without customer media', () => {
    for (const key of EXAMPLE_STYLE_KEYS) {
      const png = renderExampleStyleFrame(key);
      expect(png[0]).toBe(0x89);
      expect(inspectImageSize(png)).toEqual({ width: 320, height: 180 });
    }
  });
});

describe('store zip', () => {
  it('writes a readable local-file ZIP without path traversal', () => {
    const zip = buildStoreZip([
      { name: 'mv_abc-1080p.mp4', bytes: Uint8Array.from([0, 1, 2, 3]) },
      { name: 'manifest.json', bytes: new TextEncoder().encode('{"ok":true}') },
    ]);
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
    expect(() => buildStoreZip([{ name: '../secret', bytes: new Uint8Array([1]) }])).toThrow('unsafe_zip_name');
  });
});

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
