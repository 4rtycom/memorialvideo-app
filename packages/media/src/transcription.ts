import { mkdir } from 'node:fs/promises';

import type { TranscriptSegment } from '@memorialvideo/contracts';

import { normalizeAudioForTranscription } from './audio-normalize';
import { probeWav } from './wav-probe';

export type TranscriptionEngineResult = {
  engineName: 'xenova-whisper-tiny-en' | 'unavailable';
  engineVersion: 'v1-local' | 'none';
  segments: TranscriptSegment[];
  fullText: string;
  durationMs: number;
  warnings: string[];
  partial: boolean;
  available: boolean;
  sourceMime?: string;
  normalized?: boolean;
  executionMs?: number;
};

const TARGET_RATE = 16_000;

function readWavPcm(bytes: Uint8Array): { samples: Float32Array; sampleRate: number; durationMs: number } | null {
  const probe = probeWav(bytes);
  if (!probe || probe.sampleRate <= 0 || probe.channels <= 0) {
    return null;
  }
  let offset = 12;
  let data: Uint8Array | null = null;
  const bitsPerSample = probe.bitsPerSample;
  while (offset + 8 <= bytes.length) {
    const type = String.fromCharCode(
      bytes[offset] ?? 0,
      bytes[offset + 1] ?? 0,
      bytes[offset + 2] ?? 0,
      bytes[offset + 3] ?? 0,
    );
    const size =
      (bytes[offset + 4] ?? 0) |
      ((bytes[offset + 5] ?? 0) << 8) |
      ((bytes[offset + 6] ?? 0) << 16) |
      ((bytes[offset + 7] ?? 0) << 24);
    const start = offset + 8;
    if (type === 'data') {
      data = bytes.subarray(start, Math.min(bytes.length, start + Math.max(0, size)));
      break;
    }
    offset = start + size + (size % 2);
  }
  if (!data || data.length === 0) {
    return null;
  }
  const channels = probe.channels;
  const frameCount = Math.floor(data.length / ((bitsPerSample / 8) * channels));
  const mono = new Float32Array(frameCount);
  if (bitsPerSample === 16) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    for (let frame = 0; frame < frameCount; frame += 1) {
      let sum = 0;
      for (let channel = 0; channel < channels; channel += 1) {
        sum += view.getInt16((frame * channels + channel) * 2, true) / 32768;
      }
      mono[frame] = sum / channels;
    }
  } else if (bitsPerSample === 8) {
    for (let frame = 0; frame < frameCount; frame += 1) {
      let sum = 0;
      for (let channel = 0; channel < channels; channel += 1) {
        sum += ((data[frame * channels + channel] ?? 128) - 128) / 128;
      }
      mono[frame] = sum / channels;
    }
  } else {
    return null;
  }
  return { samples: mono, sampleRate: probe.sampleRate, durationMs: probe.durationMs };
}

function resampleMono(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) {
    return samples;
  }
  const ratio = fromRate / toRate;
  const length = Math.max(1, Math.floor(samples.length / ratio));
  const out = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const source = index * ratio;
    const left = Math.floor(source);
    const right = Math.min(samples.length - 1, left + 1);
    const frac = source - left;
    out[index] = (samples[left] ?? 0) * (1 - frac) + (samples[right] ?? 0) * frac;
  }
  return out;
}

/** Reject silence and narrowband tones so Whisper cannot invent a confident transcript. */
export function classifyPcmSpeechLikelihood(samples: Float32Array): {
  kind: 'silence' | 'tone_or_music' | 'speech_like';
  rms: number;
} {
  if (samples.length < 16) {
    return { kind: 'silence', rms: 0 };
  }
  let sumSq = 0;
  let zeroCrossings = 0;
  let prev = samples[0] ?? 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] ?? 0;
    sumSq += sample * sample;
    if ((prev >= 0 && sample < 0) || (prev < 0 && sample >= 0)) {
      zeroCrossings += 1;
    }
    prev = sample;
  }
  const rms = Math.sqrt(sumSq / samples.length);
  if (rms < 0.008) {
    return { kind: 'silence', rms };
  }

  // Autocorrelation peak ratio — pure tones show a strong periodic peak.
  const maxLag = Math.min(800, Math.floor(samples.length / 4));
  let best = 0;
  let energy = 0;
  for (let index = 0; index < samples.length; index += 1) {
    energy += (samples[index] ?? 0) * (samples[index] ?? 0);
  }
  if (energy <= 0) {
    return { kind: 'silence', rms };
  }
  for (let lag = 20; lag < maxLag; lag += 1) {
    let corr = 0;
    const limit = samples.length - lag;
    for (let index = 0; index < limit; index += 1) {
      corr += (samples[index] ?? 0) * (samples[index + lag] ?? 0);
    }
    const normalized = corr / energy;
    if (normalized > best) {
      best = normalized;
    }
  }
  const zcr = zeroCrossings / samples.length;
  if (best > 0.55 && zcr > 0.02 && zcr < 0.25) {
    return { kind: 'tone_or_music', rms };
  }
  return { kind: 'speech_like', rms };
}

function emptyPartial(input: {
  durationMs: number;
  warnings: string[];
  sourceMime?: string;
  normalized?: boolean;
  executionMs?: number;
}): TranscriptionEngineResult {
  return {
    engineName: 'xenova-whisper-tiny-en',
    engineVersion: 'v1-local',
    segments: [
      {
        id: 'seg_0',
        startMs: 0,
        endMs: Math.max(0, input.durationMs),
        engineText: '',
        silence: true,
        unintelligible: false,
        reviewState: 'unreviewed',
      },
    ],
    fullText: '',
    durationMs: input.durationMs,
    warnings: input.warnings,
    partial: true,
    available: true,
    sourceMime: input.sourceMime,
    normalized: input.normalized,
    executionMs: input.executionMs,
  };
}

export async function runLocalTranscription(input: {
  bytes: Uint8Array;
  mimeHint?: string;
  cacheDir: string;
  tempRoot?: string;
}): Promise<TranscriptionEngineResult> {
  const started = Date.now();
  const warnings: string[] = [];

  const normalized = await normalizeAudioForTranscription({
    bytes: input.bytes,
    mimeHint: input.mimeHint,
    tempRoot: input.tempRoot,
  });
  if (!normalized.ok) {
    const mapReason =
      normalized.reason === 'unsupported_input'
        ? 'unsupported_codec'
        : normalized.reason === 'no_audio_stream'
          ? 'no_audio_stream'
          : normalized.reason === 'ffmpeg_unavailable'
            ? 'ffmpeg_unavailable'
            : normalized.reason === 'too_large'
              ? 'input_too_large'
              : 'normalize_failed';
    return emptyPartial({
      durationMs: 0,
      warnings: [...normalized.warnings, mapReason],
      executionMs: Date.now() - started,
    });
  }
  warnings.push(...normalized.warnings);

  const wav = readWavPcm(normalized.wavBytes);
  const durationMs = wav?.durationMs ?? 0;
  if (!wav || durationMs === 0 || wav.samples.length < 16) {
    return emptyPartial({
      durationMs: 0,
      warnings: [...warnings, 'silent_or_empty_audio'],
      sourceMime: normalized.sourceMime,
      normalized: normalized.normalized,
      executionMs: Date.now() - started,
    });
  }

  const speech = classifyPcmSpeechLikelihood(wav.samples);
  if (speech.kind === 'silence') {
    return emptyPartial({
      durationMs,
      warnings: [...warnings, 'silent_or_empty_audio'],
      sourceMime: normalized.sourceMime,
      normalized: normalized.normalized,
      executionMs: Date.now() - started,
    });
  }
  if (speech.kind === 'tone_or_music') {
    return emptyPartial({
      durationMs,
      warnings: [...warnings, 'no_speech_detected', 'tone_or_music_rejected'],
      sourceMime: normalized.sourceMime,
      normalized: normalized.normalized,
      executionMs: Date.now() - started,
    });
  }

  try {
    await mkdir(input.cacheDir, { recursive: true });
    process.env.TRANSFORMERS_CACHE = input.cacheDir;
    process.env.HF_HOME = input.cacheDir;
    const transformers = await import('@xenova/transformers');
    const transcriber = await transformers.pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
      quantized: true,
    });
    const audio = resampleMono(wav.samples, wav.sampleRate, TARGET_RATE);
    const result = (await transcriber(audio, {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
    })) as { text?: string; chunks?: Array<{ text?: string; timestamp?: [number | null, number | null] }> };

    const chunks = result.chunks ?? [];
    const segments: TranscriptSegment[] =
      chunks.length > 0
        ? chunks.slice(0, 2000).map((chunk, index) => {
            const start = Math.max(0, Math.round(((chunk.timestamp?.[0] ?? 0) as number) * 1000));
            const end = Math.max(
              start,
              Math.round(((chunk.timestamp?.[1] ?? start / 1000 + 0.5) as number) * 1000),
            );
            const text = (chunk.text ?? '').trim();
            return {
              id: `seg_${index}`,
              startMs: start,
              endMs: end,
              engineText: text.slice(0, 4000),
              silence: text.length === 0,
              unintelligible: false,
              reviewState: 'unreviewed' as const,
            };
          })
        : [
            {
              id: 'seg_0',
              startMs: 0,
              endMs: durationMs,
              engineText: (result.text ?? '').trim().slice(0, 4000),
              silence: !(result.text ?? '').trim(),
              unintelligible: false,
              reviewState: 'unreviewed' as const,
            },
          ];

    if (segments.every((segment) => !segment.engineText)) {
      warnings.push('no_speech_detected');
    }

    return {
      engineName: 'xenova-whisper-tiny-en',
      engineVersion: 'v1-local',
      segments,
      fullText: (result.text ?? segments.map((segment) => segment.engineText).join(' ')).trim().slice(0, 100_000),
      durationMs,
      warnings,
      partial: warnings.length > 0,
      available: true,
      sourceMime: normalized.sourceMime,
      normalized: normalized.normalized,
      executionMs: Date.now() - started,
    };
  } catch (error) {
    const code =
      error instanceof Error
        ? error.message.replace(/[^\w.\-:/ ]+/g, '').slice(0, 80) || 'transcription_engine_unavailable'
        : 'transcription_engine_unavailable';
    return {
      engineName: 'unavailable',
      engineVersion: 'none',
      segments: [],
      fullText: '',
      durationMs,
      warnings: [...warnings, 'transcription_engine_unavailable', code],
      partial: true,
      available: false,
      sourceMime: normalized.sourceMime,
      normalized: normalized.normalized,
      executionMs: Date.now() - started,
    };
  }
}
