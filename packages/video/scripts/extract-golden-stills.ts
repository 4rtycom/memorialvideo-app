/**
 * Prompt 10 — Remotion composition still extraction at GOLDEN_COMPARE_FRAME.
 * Writes PNG fixtures under fixtures/golden-frames/remotion/ for frame-compare baselines.
 * Requires Chrome; does not need Docker/Supabase.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { averageHash, decodePng } from '@memorialvideo/media';

import {
  GOLDEN_COMPARE_FRAME,
  GOLDEN_THEME_KEYS,
  type GoldenThemeKey,
} from '../src/golden-frame';
import { createThemeGoldenTimeline } from '../src/timelines';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function themeFromArgs(): GoldenThemeKey | 'all' {
  const flag = process.argv.find((arg) => arg.startsWith('--theme='));
  if (!flag) {
    return 'all';
  }
  const value = flag.slice('--theme='.length) as GoldenThemeKey | 'all';
  if (value === 'all' || (GOLDEN_THEME_KEYS as readonly string[]).includes(value)) {
    return value;
  }
  throw new Error(`unknown theme ${value}`);
}

async function extractTheme(
  serveUrl: string,
  theme: GoldenThemeKey,
  outDir: string,
  hashes: Record<string, string>,
): Promise<void> {
  const timeline = createThemeGoldenTimeline(theme, true);
  const composition = await selectComposition({
    serveUrl,
    id: 'MemorialGolden',
    inputProps: timeline,
  });
  const output = path.join(outDir, `${theme}-f${String(GOLDEN_COMPARE_FRAME).padStart(3, '0')}.png`);
  await renderStill({
    composition,
    serveUrl,
    output,
    inputProps: timeline,
    frame: GOLDEN_COMPARE_FRAME,
    imageFormat: 'png',
    browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE ?? '/usr/local/bin/google-chrome',
    chromiumOptions: {
      enableMultiProcessOnLinux: false,
      gl: 'angle',
    },
  });
  const bytes = await import('node:fs/promises').then((fs) => fs.readFile(output));
  hashes[theme] = averageHash(decodePng(new Uint8Array(bytes)));
  // eslint-disable-next-line no-console
  console.log(`wrote remotion/${path.basename(output)} hash=${hashes[theme]}`);
}

async function main(): Promise<void> {
  const selected = themeFromArgs();
  const themes =
    selected === 'all' ? [...GOLDEN_THEME_KEYS] : ([selected] as GoldenThemeKey[]);
  const outDir = path.join(root, 'fixtures', 'golden-frames', 'remotion');
  await mkdir(outDir, { recursive: true });

  // eslint-disable-next-line no-console
  console.log('bundling Remotion entry…');
  const serveUrl = await bundle({
    entryPoint: path.join(root, 'src/index.ts'),
    onProgress: () => undefined,
  });

  const hashes: Record<string, string> = {};
  for (const theme of themes) {
    await extractTheme(serveUrl, theme, outDir, hashes);
  }
  await writeFile(path.join(outDir, 'composition-hashes.json'), `${JSON.stringify(hashes, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
