/**
 * Writes committed style-proxy golden still PNGs for Prompt 10 frame-compare.
 * These are synthetic theme proxies (not Remotion renderStill output).
 * Remotion still extraction remains optional when Chrome + music fixtures allow.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { encodePng } from '@memorialvideo/media';

import {
  GOLDEN_COMPARE_FRAME,
  GOLDEN_THEME_KEYS,
  goldenFrameStillPath,
  hashGoldenThemeProxyFrame,
  renderGoldenThemeProxyRgba,
} from '../src/golden-frame';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main(): Promise<void> {
  const outDir = path.join(root, 'fixtures', 'golden-frames');
  await mkdir(outDir, { recursive: true });
  const hashes: Record<string, string> = {};
  for (const theme of GOLDEN_THEME_KEYS) {
    const rgba = renderGoldenThemeProxyRgba(theme);
    const png = encodePng(rgba);
    const relative = goldenFrameStillPath(theme, GOLDEN_COMPARE_FRAME);
    const absolute = path.join(root, relative);
    await writeFile(absolute, png);
    hashes[theme] = hashGoldenThemeProxyFrame(theme);
    // eslint-disable-next-line no-console
    console.log(`wrote ${relative} hash=${hashes[theme]} bytes=${png.byteLength}`);
  }
  await writeFile(path.join(outDir, 'proxy-hashes.json'), `${JSON.stringify(hashes, null, 2)}\n`);
}

void main();
