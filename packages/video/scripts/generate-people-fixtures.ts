import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { encodeJpeg } from '@memorialvideo/media';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const outDir = path.join(repoRoot, 'packages', 'test-utils', 'fixtures', 'people-intelligence');

function resolveFfmpeg(): string | null {
  try {
    const candidate = require('ffmpeg-static') as string | null;
    return candidate && typeof candidate === 'string' ? candidate : null;
  } catch {
    return null;
  }
}
function fill(data: Uint8Array, width: number, height: number, rgba: [number, number, number, number]) {
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = rgba[0];
    data[i * 4 + 1] = rgba[1];
    data[i * 4 + 2] = rgba[2];
    data[i * 4 + 3] = rgba[3];
  }
}

function oval(
  data: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: [number, number, number],
) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny <= 1) {
        const i = (y * width + x) * 4;
        data[i] = color[0];
        data[i + 1] = color[1];
        data[i + 2] = color[2];
        data[i + 3] = 255;
      }
    }
  }
}

function makeFace(
  width: number,
  height: number,
  tone: [number, number, number],
  offsetX = 0,
): { width: number; height: number; data: Uint8Array } {
  const data = new Uint8Array(width * height * 4);
  fill(data, width, height, [230, 228, 220, 255]);
  const cx = width / 2 + offsetX;
  const cy = height / 2;
  oval(data, width, height, cx, cy, width * 0.22, height * 0.3, tone);
  oval(data, width, height, cx - width * 0.08, cy - height * 0.05, width * 0.03, height * 0.02, [40, 40, 40]);
  oval(data, width, height, cx + width * 0.08, cy - height * 0.05, width * 0.03, height * 0.02, [40, 40, 40]);
  oval(data, width, height, cx, cy + height * 0.02, width * 0.025, height * 0.035, [120, 80, 70]);
  oval(data, width, height, cx, cy + height * 0.12, width * 0.08, height * 0.03, [140, 70, 70]);
  return { width, height, data };
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const personA1 = encodeJpeg(makeFace(640, 480, [210, 170, 140]), 90);
  const personA2 = encodeJpeg(makeFace(640, 480, [205, 165, 135], 8), 90);
  const personB = encodeJpeg(makeFace(640, 480, [120, 90, 70], -20), 90);
  const group = (() => {
    const base = makeFace(800, 600, [210, 170, 140], -120);
    oval(base.data, 800, 600, 520, 300, 120, 160, [120, 90, 70]);
    oval(base.data, 800, 600, 500, 280, 18, 12, [40, 40, 40]);
    oval(base.data, 800, 600, 540, 280, 18, 12, [40, 40, 40]);
    return encodeJpeg(base, 90);
  })();
  const blurry = encodeJpeg(makeFace(160, 120, [200, 160, 130]), 40);
  const noFace = encodeJpeg(
    (() => {
      const data = new Uint8Array(320 * 240 * 4);
      fill(data, 320, 240, [180, 190, 200, 255]);
      return { width: 320, height: 240, data };
    })(),
    90,
  );
  const statueLike = encodeJpeg(
    (() => {
      const data = new Uint8Array(400 * 400 * 4);
      fill(data, 400, 400, [200, 200, 205, 255]);
      oval(data, 400, 400, 200, 200, 80, 110, [160, 160, 165]);
      return { width: 400, height: 400, data };
    })(),
    90,
  );

  await writeFile(path.join(outDir, 'person-a-1.jpg'), personA1);
  await writeFile(path.join(outDir, 'person-a-2.jpg'), personA2);
  await writeFile(path.join(outDir, 'person-b.jpg'), personB);
  await writeFile(path.join(outDir, 'group.jpg'), group);
  await writeFile(path.join(outDir, 'blurry-small.jpg'), blurry);
  await writeFile(path.join(outDir, 'no-face.jpg'), noFace);
  await writeFile(path.join(outDir, 'statue-like.jpg'), statueLike);

  let videoOk = false;
  const ffmpeg = resolveFfmpeg();
  if (ffmpeg) {
    const stillPath = path.join(outDir, 'person-a-1.jpg');
    const videoPath = path.join(outDir, 'person-a-clip.mp4');
    const result = spawnSync(
      ffmpeg,
      [
        '-y',
        '-loop',
        '1',
        '-i',
        stillPath,
        '-t',
        '4',
        '-r',
        '6',
        '-pix_fmt',
        'yuv420p',
        '-c:v',
        'libx264',
        videoPath,
      ],
      { windowsHide: true, encoding: 'utf8' },
    );
    videoOk = result.status === 0;
  }

  await writeFile(
    path.join(outDir, 'README.md'),
    [
      '# People Intelligence fixtures (MV-112 / MV-124)',
      '',
      'Synthetic geometric face-like ovals only. Not photographs of real people.',
      'Generated locally for detection/clustering smoke tests.',
      'Do not replace with scraped social media, celebrities, or unidentified real faces.',
      '',
      videoOk
        ? '`person-a-clip.mp4` is a short H.264 clip made from `person-a-1.jpg` for video frame sampling (MV-124).'
        : 'Video clip skipped (ffmpeg unavailable).',
      '',
    ].join('\n'),
  );
  process.stdout.write(
    `${JSON.stringify({ outDir, files: videoOk ? 8 : 7, video: videoOk }, null, 2)}\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
