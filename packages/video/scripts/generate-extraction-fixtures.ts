import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { encodeJpeg } from '@memorialvideo/media';

const require = createRequire(import.meta.url);

/** Intentionally non-sensitive synthetic speech line for local ASR smoke (fixture-only). */
export const SYNTHETIC_SPEECH_LINE = 'Every Sunday, our family went sailing together.';
export const SYNTHETIC_SPEECH_PROVENANCE =
  'Windows System.Speech.Synthesis (local TTS) → mono 16 kHz PCM WAV; no private or copyrighted recording.';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const SPACE_GLYPH: number[][] = [[0], [0], [0], [0], [0]];

const FONT: Record<string, number[][]> = {
  R: [
    [1, 1, 1, 0],
    [1, 0, 0, 1],
    [1, 1, 1, 0],
    [1, 0, 1, 0],
    [1, 0, 0, 1],
  ],
  O: [
    [0, 1, 1, 0],
    [1, 0, 0, 1],
    [1, 0, 0, 1],
    [1, 0, 0, 1],
    [0, 1, 1, 0],
  ],
  T: [
    [1, 1, 1],
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
  ],
  E: [
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 0],
    [1, 0, 0],
    [1, 1, 1],
  ],
  D: [
    [1, 1, 0],
    [1, 0, 1],
    [1, 0, 1],
    [1, 0, 1],
    [1, 1, 0],
  ],
  A: [
    [0, 1, 0],
    [1, 0, 1],
    [1, 1, 1],
    [1, 0, 1],
    [1, 0, 1],
  ],
  M: [
    [1, 0, 0, 0, 1],
    [1, 1, 0, 1, 1],
    [1, 0, 1, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1],
  ],
  Y: [
    [1, 0, 1],
    [1, 0, 1],
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
  ],
  '1': [
    [0, 1, 0],
    [1, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
    [1, 1, 1],
  ],
  '9': [
    [0, 1, 1, 0],
    [1, 0, 0, 1],
    [0, 1, 1, 1],
    [0, 0, 0, 1],
    [0, 1, 1, 0],
  ],
  '7': [
    [1, 1, 1],
    [0, 0, 1],
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
  ],
  '2': [
    [1, 1, 1],
    [0, 0, 1],
    [0, 1, 0],
    [1, 0, 0],
    [1, 1, 1],
  ],
  '4': [
    [1, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 0, 1],
    [0, 0, 1],
  ],
  ' ': SPACE_GLYPH,
  ',': [[0], [0], [0], [1], [1]],
};

function renderText(text: string, scale = 8): { width: number; height: number; data: Uint8Array } {
  const gap = 1;
  let width = 20;
  for (const char of text.toUpperCase()) {
    const glyph = FONT[char] ?? SPACE_GLYPH;
    width += ((glyph[0]?.length ?? 1) + gap) * scale;
  }
  const height = 5 * scale + 40;
  const data = new Uint8Array(width * height * 4);
  data.fill(255);
  let x = 10;
  const y = 20;
  for (const char of text.toUpperCase()) {
    const glyph = FONT[char] ?? SPACE_GLYPH;
    for (let row = 0; row < glyph.length; row += 1) {
      const cells = glyph[row];
      if (!cells) {
        continue;
      }
      for (let col = 0; col < cells.length; col += 1) {
        if (!cells[col]) {
          continue;
        }
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            const px = x + col * scale + dx;
            const py = y + row * scale + dy;
            const index = (py * width + px) * 4;
            data[index] = 0;
            data[index + 1] = 0;
            data[index + 2] = 0;
            data[index + 3] = 255;
          }
        }
      }
    }
    x += ((glyph[0]?.length ?? 1) + gap) * scale;
  }
  return { width, height, data };
}

function writeWavSilence(filePath: string, durationMs = 500): void {
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
  writeFileSync(filePath, buffer);
}

function writeToneWav(filePath: string, durationMs = 1500, hz = 440): void {
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
    const value = Math.sin((2 * Math.PI * hz * index) / sampleRate);
    buffer.writeInt16LE(Math.floor(value * 12000), 44 + index * 2);
  }
  writeFileSync(filePath, buffer);
}

function writeCorruptAudio(filePath: string): void {
  writeFileSync(filePath, Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd, 0x00, 0x00]));
}

function resolveFfmpeg(): string | null {
  try {
    const candidate = require('ffmpeg-static') as string | null;
    if (candidate && typeof candidate === 'string') {
      return candidate;
    }
  } catch {
    // fall through
  }
  try {
    const mediaRequire = createRequire(
      path.join(root, 'packages', 'media', 'package.json'),
    );
    const candidate = mediaRequire('ffmpeg-static') as string | null;
    return candidate && typeof candidate === 'string' ? candidate : null;
  } catch {
    return null;
  }
}

function writeSyntheticSpeechWav(filePath: string): { ok: boolean; method: string } {
  if (process.platform === 'win32') {
    const ps = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = -1
$synth.Volume = 100
$synth.SetOutputToWaveFile(${JSON.stringify(filePath)})
$synth.Speak(${JSON.stringify(SYNTHETIC_SPEECH_LINE)})
$synth.Dispose()
`;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], {
      windowsHide: true,
      encoding: 'utf8',
    });
    if (result.status === 0 && existsSync(filePath) && readFileSync(filePath).length > 1000) {
      // Re-encode to mono 16 kHz PCM when ffmpeg is available (SAPI may write 22.05/44.1 kHz).
      const ffmpeg = resolveFfmpeg();
      if (ffmpeg) {
        const tmp = `${filePath}.raw.wav`;
        writeFileSync(tmp, readFileSync(filePath));
        const convert = spawnSync(
          ffmpeg,
          ['-hide_banner', '-nostdin', '-y', '-i', tmp, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', filePath],
          { windowsHide: true },
        );
        try {
          unlinkSync(tmp);
        } catch {
          // ignore
        }
        if (convert.status === 0) {
          return { ok: true, method: 'system.speech+ffmpeg_pcm16k' };
        }
      }
      return { ok: true, method: 'system.speech' };
    }
  }
  return { ok: false, method: 'unavailable' };
}

function writeMp3FromWav(wavPath: string, mp3Path: string): boolean {
  const ffmpeg = resolveFfmpeg();
  if (!ffmpeg || !existsSync(wavPath)) {
    return false;
  }
  const result = spawnSync(
    ffmpeg,
    ['-hide_banner', '-nostdin', '-y', '-i', wavPath, '-codec:a', 'libmp3lame', '-q:a', '4', mp3Path],
    { windowsHide: true },
  );
  return result.status === 0 && existsSync(mp3Path);
}

const outDir = path.join(root, 'packages', 'test-utils', 'fixtures', 'content-extraction');
mkdirSync(outDir, { recursive: true });
const card = renderText('ROTTERDAM, 14 MAY 1972', 10);
const encoded = encodeJpeg({ data: card.data, width: card.width, height: card.height }, 90);
writeFileSync(path.join(outDir, 'ocr-card.jpg'), encoded);
writeWavSilence(path.join(outDir, 'silence.wav'));
writeToneWav(path.join(outDir, 'tone.wav'));
writeCorruptAudio(path.join(outDir, 'corrupt.bin'));

const spokenPath = path.join(outDir, 'spoken.wav');
const speech = writeSyntheticSpeechWav(spokenPath);
const files = ['ocr-card.jpg', 'silence.wav', 'tone.wav', 'corrupt.bin'];
if (speech.ok) {
  files.push('spoken.wav');
  const mp3Path = path.join(outDir, 'spoken.mp3');
  if (writeMp3FromWav(spokenPath, mp3Path)) {
    files.push('spoken.mp3');
  }
}

process.stdout.write(
  `${JSON.stringify({
    outDir,
    files,
    speechLine: SYNTHETIC_SPEECH_LINE,
    speechProvenance: SYNTHETIC_SPEECH_PROVENANCE,
    speechMethod: speech.method,
    speechOk: speech.ok,
  })}\n`,
);
