import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { encodeJpeg, type RgbaImage } from '@memorialvideo/media';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const outDir = path.join(repoRoot, 'packages', 'test-utils', 'fixtures', 'media-enhancement');

function fill(data: Uint8Array, width: number, height: number, rgba: [number, number, number, number]) {
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = rgba[0];
    data[i * 4 + 1] = rgba[1];
    data[i * 4 + 2] = rgba[2];
    data[i * 4 + 3] = rgba[3];
  }
}

function rect(
  data: Uint8Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: [number, number, number],
) {
  for (let y = Math.max(0, y0); y < Math.min(height, y1); y += 1) {
    for (let x = Math.max(0, x0); x < Math.min(width, x1); x += 1) {
      const i = (y * width + x) * 4;
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = 255;
    }
  }
}

function makeBase(width: number, height: number, color: [number, number, number]): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  fill(data, width, height, [...color, 255]);
  return { width, height, data };
}

function faded(): RgbaImage {
  const img = makeBase(320, 240, [168, 162, 150]);
  rect(img.data, 320, 240, 40, 40, 280, 200, [190, 175, 160]);
  rect(img.data, 320, 240, 80, 80, 240, 160, [200, 188, 170]);
  return img;
}

function dark(): RgbaImage {
  const img = makeBase(320, 240, [18, 20, 28]);
  rect(img.data, 320, 240, 60, 50, 260, 190, [32, 36, 48]);
  rect(img.data, 320, 240, 120, 90, 200, 150, [48, 52, 64]);
  return img;
}

function noisy(): RgbaImage {
  const img = makeBase(280, 200, [120, 130, 140]);
  for (let i = 0; i < img.width * img.height; i += 1) {
    const n = ((i * 37) % 40) - 20;
    const o = i * 4;
    img.data[o] = Math.max(0, Math.min(255, (img.data[o] ?? 0) + n));
    img.data[o + 1] = Math.max(0, Math.min(255, (img.data[o + 1] ?? 0) + n));
    img.data[o + 2] = Math.max(0, Math.min(255, (img.data[o + 2] ?? 0) - n));
  }
  return img;
}

function soft(): RgbaImage {
  const img = makeBase(300, 220, [150, 160, 170]);
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      const o = (y * img.width + x) * 4;
      const v = 140 + Math.floor(20 * Math.sin(x / 18) * Math.cos(y / 22));
      img.data[o] = v;
      img.data[o + 1] = v + 8;
      img.data[o + 2] = v + 16;
    }
  }
  return img;
}

function lowres(): RgbaImage {
  return makeBase(96, 72, [90, 110, 130]);
}

function rotated(): RgbaImage {
  const img = makeBase(200, 280, [210, 200, 180]);
  rect(img.data, 200, 280, 20, 20, 180, 60, [40, 80, 140]);
  rect(img.data, 200, 280, 70, 100, 130, 220, [160, 90, 70]);
  return img;
}

function bordered(): RgbaImage {
  const img = makeBase(300, 220, [240, 236, 228]);
  rect(img.data, 300, 220, 0, 0, 300, 24, [250, 248, 240]);
  rect(img.data, 300, 220, 0, 196, 300, 220, [250, 248, 240]);
  rect(img.data, 300, 220, 0, 0, 24, 220, [250, 248, 240]);
  rect(img.data, 300, 220, 276, 0, 300, 220, [250, 248, 240]);
  rect(img.data, 300, 220, 40, 40, 260, 180, [100, 130, 90]);
  return img;
}

function textCard(): RgbaImage {
  const img = makeBase(360, 240, [245, 242, 235]);
  rect(img.data, 360, 240, 40, 50, 320, 80, [30, 30, 30]);
  rect(img.data, 360, 240, 40, 100, 280, 118, [50, 50, 50]);
  rect(img.data, 360, 240, 40, 140, 300, 158, [50, 50, 50]);
  return img;
}

function highQuality(): RgbaImage {
  const img = makeBase(480, 320, [70, 120, 160]);
  rect(img.data, 480, 320, 40, 40, 200, 280, [220, 180, 120]);
  rect(img.data, 480, 320, 260, 60, 440, 260, [40, 90, 70]);
  return img;
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const files: Array<[string, RgbaImage]> = [
    ['faded.jpg', faded()],
    ['dark.jpg', dark()],
    ['noisy.jpg', noisy()],
    ['soft.jpg', soft()],
    ['lowres.jpg', lowres()],
    ['rotated.jpg', rotated()],
    ['bordered.jpg', bordered()],
    ['text-card.jpg', textCard()],
    ['high-quality.jpg', highQuality()],
  ];
  for (const [name, image] of files) {
    await writeFile(path.join(outDir, name), encodeJpeg(image, 85));
  }
  await writeFile(
    path.join(outDir, 'README.md'),
    [
      '# Media enhancement fixtures (MV-107)',
      '',
      'Synthetic geometric JPEGs only. Not photographs of real people.',
      'Generated locally for deterministic correction smoke and Playwright journeys.',
      'Do not replace with real customer or deceased-person media.',
      '',
    ].join('\n'),
  );
  process.stdout.write(`${JSON.stringify({ outDir, files: files.length }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
