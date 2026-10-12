/**
 * Prompt 10 — golden theme frame-compare prep.
 * Fixed Remotion still index + perceptual-hash compare against committed theme proxy stills.
 * Full Remotion renderStill extraction stays optional (`fixtures:golden-frames` writes proxies).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EXAMPLE_STYLE_KEYS,
  EXAMPLE_STYLE_TOKENS,
  type ExampleStyleKey,
} from '@memorialvideo/media/example-frame';
import { averageHash, decodePng, encodePng, hammingHex, type RgbaImage } from '@memorialvideo/media';

/** Fixed frame index inside golden timelines (30fps → 3.0s into the film). */
export const GOLDEN_COMPARE_FRAME = 90;

/** Hamming distance at or below this counts as a match for style-proxy stills. */
export const GOLDEN_FRAME_HAMMING_LIMIT = 8;

export const GOLDEN_THEME_KEYS = EXAMPLE_STYLE_KEYS;
export type GoldenThemeKey = ExampleStyleKey;

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function goldenFrameStillPath(theme: GoldenThemeKey, frame = GOLDEN_COMPARE_FRAME): string {
  return `fixtures/golden-frames/${theme}-f${String(frame).padStart(3, '0')}.png`;
}

export function goldenFrameStillAbsolutePath(theme: GoldenThemeKey, frame = GOLDEN_COMPARE_FRAME): string {
  return path.join(packageRoot, goldenFrameStillPath(theme, frame));
}

/** Deterministic RGBA style-proxy still used as the committed golden-frame baseline. */
export function renderGoldenThemeProxyRgba(theme: GoldenThemeKey, width = 320, height = 180): RgbaImage {
  const tokens = EXAMPLE_STYLE_TOKENS[theme];
  const data = new Uint8Array(width * height * 4);
  const image: RgbaImage = { width, height, data };
  fill(image, 0, 0, width, height, tokens.background);
  if (tokens.treatment === 'editorial') {
    fill(image, width * 0.12, height * 0.14, width * 0.88, height * 0.86, tokens.paper);
    fill(image, width * 0.2, height * 0.22, width * 0.8, height * 0.72, tokens.ink);
    fill(image, width * 0.2, height * 0.78, width * 0.45, height * 0.82, tokens.accent);
  } else if (tokens.treatment === 'fullBleed') {
    fill(image, 0, 0, width, height, tokens.paper);
    fill(image, 0, height * 0.08, width, height * 0.78, tokens.ink);
    fill(image, 0, height * 0.78, width, height, tokens.accent);
  } else {
    fill(image, width * 0.08, height * 0.1, width * 0.92, height * 0.9, tokens.paper);
    fill(image, width * 0.28, height * 0.18, width * 0.72, height * 0.78, tokens.ink);
    fill(image, width * 0.28, height * 0.82, width * 0.52, height * 0.86, tokens.accent);
  }
  return image;
}

export function encodeGoldenThemeProxyPng(theme: GoldenThemeKey): Uint8Array {
  return encodePng(renderGoldenThemeProxyRgba(theme));
}

export function hashGoldenThemeProxyFrame(theme: GoldenThemeKey): string {
  return averageHash(renderGoldenThemeProxyRgba(theme));
}

export function loadCommittedGoldenFramePng(theme: GoldenThemeKey): Uint8Array {
  return new Uint8Array(readFileSync(goldenFrameStillAbsolutePath(theme)));
}

export function hashCommittedGoldenFrame(theme: GoldenThemeKey): string {
  return averageHash(decodePng(loadCommittedGoldenFramePng(theme)));
}

export function compareGoldenFrameHash(input: {
  theme: GoldenThemeKey;
  candidateHash: string;
  limit?: number;
}): { ok: true; distance: number } | { ok: false; distance: number; reason: 'hash_mismatch' } {
  const expected = hashGoldenThemeProxyFrame(input.theme);
  const distance = hammingHex(expected, input.candidateHash);
  const limit = input.limit ?? GOLDEN_FRAME_HAMMING_LIMIT;
  if (distance <= limit) {
    return { ok: true, distance };
  }
  return { ok: false, distance, reason: 'hash_mismatch' };
}

export function compareCandidatePngToGoldenProxy(input: {
  theme: GoldenThemeKey;
  pngBytes: Uint8Array;
  limit?: number;
}): { ok: true; distance: number } | { ok: false; distance: number; reason: 'hash_mismatch' | 'not_png' } {
  try {
    const candidateHash = averageHash(decodePng(input.pngBytes));
    return compareGoldenFrameHash({
      theme: input.theme,
      candidateHash,
      limit: input.limit,
    });
  } catch {
    return { ok: false, distance: 64, reason: 'not_png' };
  }
}

function fill(
  image: RgbaImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: [number, number, number],
): void {
  const left = Math.max(0, Math.floor(x0));
  const top = Math.max(0, Math.floor(y0));
  const right = Math.min(image.width, Math.ceil(x1));
  const bottom = Math.min(image.height, Math.ceil(y1));
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      image.data.set([color[0], color[1], color[2], 255], (y * image.width + x) * 4);
    }
  }
}
