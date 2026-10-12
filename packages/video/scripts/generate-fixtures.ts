import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { encodePng } from './png';
import { encodeSineWav } from './wav';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'fixtures', 'generated');

const palettes: Array<readonly [number, number, number]> = [
  [214, 196, 168],
  [92, 108, 122],
  [169, 120, 76],
  [232, 220, 204],
  [48, 62, 74],
  [176, 154, 132],
];

const sizes = [
  { width: 640, height: 360 },
  { width: 360, height: 640 },
  { width: 480, height: 480 },
  { width: 320, height: 240 },
] as const;

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });

  for (let index = 0; index < 100; index += 1) {
    const size = sizes[index % sizes.length]!;
    const color = palettes[index % palettes.length]!;
    const id = String(index + 1).padStart(3, '0');
    await writeFile(path.join(outDir, `image-${id}.png`), encodePng(size.width, size.height, color));
  }

  await writeFile(
    path.join(outDir, 'music-still-water.wav'),
    encodeSineWav({ seconds: 45, frequency: 196 }),
  );
  await writeFile(
    path.join(outDir, 'music-warm-room.wav'),
    encodeSineWav({ seconds: 45, frequency: 246.94 }),
  );

  process.stdout.write(`Wrote 100 images and 2 audio fixtures to ${outDir}\n`);
}

await main();
