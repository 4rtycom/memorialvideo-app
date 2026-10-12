import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const outDir = path.join(root, 'packages', 'test-utils', 'fixtures', 'multitrack-audio');
const publicDir = path.join(root, 'apps', 'video', 'public', 'fixtures', 'multitrack');

function resolveFfmpeg(): string | null {
  try {
    const require = createRequire(path.join(root, 'packages', 'media', 'package.json'));
    const candidate = require('ffmpeg-static') as string | null;
    return candidate && typeof candidate === 'string' ? candidate : null;
  } catch {
    return null;
  }
}

function writeToneWav(filePath: string, durationMs: number, hz: number, amplitude = 0.4): void {
  const sampleRate = 16000;
  const samples = Math.floor((sampleRate * durationMs) / 1000);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples; index += 1) {
    const value = Math.sin((2 * Math.PI * hz * index) / sampleRate) * amplitude;
    buffer.writeInt16LE(Math.floor(value * 32767), 44 + index * 2);
  }
  writeFileSync(filePath, buffer);
}

function writeSpeechLikeWav(filePath: string): void {
  // Alternating mid/high amplitude bursts to mimic speech energy without private content.
  const sampleRate = 16000;
  const durationMs = 3000;
  const samples = Math.floor((sampleRate * durationMs) / 1000);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples; index += 1) {
    const burst = Math.floor(index / 1600) % 2 === 0 ? 0.55 : 0.08;
    const hz = 220 + (Math.floor(index / 800) % 3) * 40;
    const value = Math.sin((2 * Math.PI * hz * index) / sampleRate) * burst;
    buffer.writeInt16LE(Math.floor(value * 32767), 44 + index * 2);
  }
  writeFileSync(filePath, buffer);
}

mkdirSync(outDir, { recursive: true });
mkdirSync(publicDir, { recursive: true });
const musicPath = path.join(outDir, 'music-synthetic.wav');
const narrationPath = path.join(outDir, 'narration.wav');
const speechWavPath = path.join(outDir, 'speech.wav');
const speechVideoPath = path.join(outDir, 'speech-clip.mp4');
const stillPath = path.join(outDir, 'still.jpg');

writeToneWav(musicPath, 6000, 1200, 0.45);
writeToneWav(narrationPath, 2000, 330, 0.45);
writeSpeechLikeWav(speechWavPath);

// Copy a known tiny JPEG from enhancement fixtures when present; else write a 1x1.
const enhancementStill = path.join(root, 'packages', 'test-utils', 'fixtures', 'media-enhancement', 'high-quality.jpg');
if (existsSync(enhancementStill)) {
  writeFileSync(stillPath, readFileSync(enhancementStill));
} else {
  writeFileSync(
    stillPath,
    Buffer.from(
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBUQEBAVFRUVFRUVFRUVFRUVFRUWFhUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMtNygtLisBCgoKDg0OGxAQGy0lICYtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAbAAACAwEBAQAAAAAAAAAAAAADBAECBQYAB//EADUQAAIBAgQDBgUEAwEBAQAAAAECAwQRAAUSITFBBhMiUWFxMoGRobHB0RRS4fAHFSNCYvEV/8QAGQEAAwEBAQAAAAAAAAAAAAAAAAECAwQF/8QAHhEAAgIDAQEBAAAAAAAAAAAAAAECEQMhEjFBBP/aAAwDAQACEQMRAD8A9UooooAKKKKACiiigAooooA//9k=',
      'base64',
    ),
  );
}

const ffmpeg = resolveFfmpeg();
const files = ['music-synthetic.wav', 'narration.wav', 'speech.wav', 'still.jpg'];
if (ffmpeg) {
  const result = spawnSync(
    ffmpeg,
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=#2c3a4a:s=640x360:d=3',
      '-i',
      speechWavPath,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      speechVideoPath,
    ],
    { windowsHide: true, encoding: 'utf8' },
  );
  if (result.status === 0 && existsSync(speechVideoPath)) {
    files.push('speech-clip.mp4');
  }
}

writeFileSync(
  path.join(outDir, 'README.md'),
  `# Multitrack audio fixtures (MV-108)

Synthetic only — no commercial or private media.

- \`music-synthetic.wav\` — rights-cleared fixture music (sine)
- \`narration.wav\` — uploaded narration take substitute (sine)
- \`speech.wav\` / \`speech-clip.mp4\` — original speech energy for ducking windows
- \`still.jpg\` — timeline still

Regenerate: \`corepack pnpm --filter @memorialvideo/video fixtures:audio\`
`,
);

for (const name of files) {
  const from = path.join(outDir, name);
  if (existsSync(from)) {
    copyFileSync(from, path.join(publicDir, name));
  }
}

console.log(JSON.stringify({ outDir, publicDir, files }, null, 2));
