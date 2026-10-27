import { spawn } from 'node:child_process';
import { access, copyFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { OutputProbe } from '@memorialvideo/domain';
import { dbToLinear } from '@memorialvideo/domain';
import {
  parseTimelineContract,
  resolveFilmStyleManifest,
  totalDurationFrames,
  type AudioMixContract,
  type Crop,
  type FilmStyleManifest,
  type LaunchLanguage,
  type TimelineContract,
  type Transition,
} from '@memorialvideo/contracts';

const CREATOR_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const VIDEO_ROOT = path.resolve(CREATOR_ROOT, 'packages/video');
const VIDEO_PUBLIC = path.join(VIDEO_ROOT, 'public');
const VIDEO_ENTRY = path.join(VIDEO_ROOT, 'src', 'index.ts');
const SYNTHETIC_CATALOG_WAV = path.join(VIDEO_PUBLIC, 'fixtures', 'multitrack', 'music-synthetic.wav');

export type LocalEncoderKind = 'remotion' | 'ffmpeg' | 'unavailable';

export type ResolvedTimelineMusic = {
  absolute: string;
  /** How the bytes were chosen — never invents commercial masters (XB-002). */
  source: 'audio_mix' | 'legacy_music' | 'catalog_fixture';
};

/** One AudioMix (or legacy) music clip resolved to readable WAV/bytes for ffmpeg. */
export type ResolvedMusicClip = {
  id: string;
  absolute: string;
  startFrame: number;
  durationFrames: number;
  gainDb: number;
  fadeInFrames: number;
  fadeOutFrames: number;
};

export type FfmpegAudioSource =
  | 'timeline_music'
  | 'timeline_music_ducked'
  | 'timeline_dialogue'
  | 'timeline_mix'
  | 'timeline_mix_ducked'
  | 'sine_fallback';

/** One speech/narration clip resolved for ffmpeg dialogue mux. */
export type ResolvedDialogueClip = {
  id: string;
  absolute: string;
  startFrame: number;
  durationFrames: number;
  gainDb: number;
  kind: 'speech' | 'narration';
};

/** One on-screen line burned into a scene (matches Remotion MediaScene / SafeType). */
export type SceneOverlayLine = {
  text: string;
  role: 'title' | 'subtitle' | 'caption' | 'eyebrow';
};

type SceneMediaInput =
  | {
      kind: 'image' | 'video';
      absolute: string;
      durationSeconds: number;
      durationFrames: number;
      overlays: SceneOverlayLine[];
      /** Remotion SceneArrive transition — honored on default ffmpeg READY. */
      transitionIn: Transition;
      /** Remotion MediaScene cover framing — honored on default ffmpeg READY. */
      crop?: Crop;
      /**
       * Remotion MediaScene Ken Burns (image only).
       * Mirrors apps/video/src/motion.ts sceneSeed + theme.motionIntensity.
       */
      motionSeed?: number;
      motionIntensity?: number;
    }
  | {
      /** Intro / chapter / outro / quote slots — solid color holds timeline length for QC. */
      kind: 'color';
      durationSeconds: number;
      overlays: SceneOverlayLine[];
      transitionIn: Transition;
      /**
       * CSS hex from FilmStyleManifest — `background` for title cards,
       * `mediaMatte` when standing in for missing image/video.
       */
      fillCss: string;
    };

/**
 * Remotion MemorialComposition intro eyebrow — locale remembrance line.
 * Burned on default ffmpeg READY so Cinema ↔ ceremony MP4 stay honest.
 */
export const REMEMBRANCE_BY_LOCALE: Record<LaunchLanguage, string> = {
  en: 'In remembrance',
  nl: 'Ter herinnering',
  de: 'In stillem Gedenken',
  fr: 'En souvenir',
  es: 'En recuerdo',
  pt: 'Em memória',
  it: 'In ricordo',
  pl: 'Ku pamięci',
};

/**
 * Convert FilmStyleManifest CSS hex (`#F6F1E8` / `#RGB`) to ffmpeg lavfi/drawtext `0xRRGGBB`.
 * Rejects non-hex (rgba watermark strings are not solid fills).
 */
export function cssColorToFfmpegHex(css: string): string | null {
  const trimmed = css.trim();
  const short = /^#([0-9a-fA-F]{3})$/.exec(trimmed);
  if (short) {
    const [r, g, b] = short[1].toUpperCase().split('');
    return `0x${r}${r}${g}${g}${b}${b}`;
  }
  const full = /^#([0-9a-fA-F]{6})$/.exec(trimmed);
  if (full) {
    return `0x${full[1].toUpperCase()}`;
  }
  return null;
}

/** lavfi `color=` source from a FilmStyleManifest solid (background / mediaMatte). */
export function buildThemeLavfiColorSource(input: {
  cssColor: string;
  width: number;
  height: number;
  durationSeconds: number;
  /** Fallback when cssColor is not a parseable hex (should not happen for manifests). */
  fallbackCss?: string;
}): string {
  const hex =
    cssColorToFfmpegHex(input.cssColor) ??
    cssColorToFfmpegHex(input.fallbackCss ?? '#1C1917') ??
    '0x1C1917';
  return `color=c=${hex}:s=${input.width}x${input.height}:d=${input.durationSeconds.toFixed(3)}`;
}

/**
 * Deterministic per-scene seed — mirrors apps/video/src/motion.ts `sceneSeed`.
 * No Math.random(); render-stable across ffmpeg and Remotion.
 */
export function sceneMotionSeed(timelineSeed: number, sceneId: string): number {
  let value = timelineSeed >>> 0;
  for (let index = 0; index < sceneId.length; index += 1) {
    value = (Math.imul(value, 33) + sceneId.charCodeAt(index)) >>> 0;
  }
  return value;
}

/**
 * ffmpeg cover framing matching Remotion MediaScene objectFit:cover + objectPosition + zoom.
 * Letterbox/pad silently dropped Guided Variants focal crops and vertical/square delivery shape.
 */
export function buildSceneCoverScaleFilter(
  width: number,
  height: number,
  crop: Crop | undefined,
  fps: number,
): string {
  const focalX = Math.min(1, Math.max(0, crop?.focalX ?? 0.5));
  const focalY = Math.min(1, Math.max(0, crop?.focalY ?? 0.5));
  const zoom = Math.min(3, Math.max(1, crop?.zoom ?? 1));
  const coverW = Math.max(2, Math.round(width * zoom));
  const coverH = Math.max(2, Math.round(height * zoom));
  // Even dimensions keep libx264 happy after crop.
  const outW = width % 2 === 0 ? width : width - 1;
  const outH = height % 2 === 0 ? height : height - 1;
  return [
    `scale=${coverW}:${coverH}:force_original_aspect_ratio=increase`,
    `crop=${outW}:${outH}:'(iw-ow)*${focalX.toFixed(4)}':'(ih-oh)*${focalY.toFixed(4)}'`,
    'setsar=1',
    `fps=${fps}`,
    'format=yuv420p',
  ].join(',');
}

/**
 * ffmpeg Ken Burns matching Remotion MediaScene (kenBurnsScale + kenBurnsShift).
 * Image scenes only — video stays static cover (same as Remotion MediaScene).
 * Uses seeded travel/pan from apps/video/src/motion.ts; no Math.random().
 */
export function buildSceneKenBurnsFilter(
  width: number,
  height: number,
  crop: Crop | undefined,
  fps: number,
  durationFrames: number,
  motionSeed: number,
  motionIntensity: number,
): string {
  const intensity = Math.min(1.5, Math.max(0, motionIntensity));
  const d = Math.max(1, Math.round(durationFrames));
  if (intensity <= 0 || d <= 1) {
    return buildSceneCoverScaleFilter(width, height, crop, fps);
  }

  const focalX = Math.min(1, Math.max(0, crop?.focalX ?? 0.5));
  const focalY = Math.min(1, Math.max(0, crop?.focalY ?? 0.5));
  const zoom = Math.min(3, Math.max(1, crop?.zoom ?? 1));
  const outW = width % 2 === 0 ? width : width - 1;
  const outH = height % 2 === 0 ? height : height - 1;

  // Remotion kenBurnsScale / kenBurnsShift direction + travel (motion.ts).
  const travel = (motionSeed % 2 === 0 ? 0.05 : -0.04) * intensity;
  const dirX = motionSeed % 3 === 0 ? 1 : motionSeed % 3 === 1 ? -1 : 0.35;
  const dirY = ((motionSeed >>> 3) % 3 === 0 ? -1 : 0.7) * 0.65;
  const zFrom = Math.max(1.001, zoom);
  const zTo = Math.max(1.001, zoom * (1 + travel));
  // Pre-scale buffer holds peak zoom + small pan headroom so crop never samples outside.
  const zPeak = Math.max(zFrom, zTo) * 1.04;
  const preWRaw = Math.max(2, Math.round(outW * zPeak));
  const preHRaw = Math.max(2, Math.round(outH * zPeak));
  const preW = preWRaw % 2 === 0 ? preWRaw : preWRaw + 1;
  const preH = preHRaw % 2 === 0 ? preHRaw : preHRaw + 1;

  // Relative zoom inside the pre-scaled buffer (1 = full buffer → most zoomed out of the pair).
  const relFrom = zPeak / zFrom;
  const relTo = zPeak / zTo;
  const denom = d - 1;
  // smoothstep — same easedProgress as apps/video/src/motion.ts
  const p = `on/${denom}`;
  const eased = `(${p})*(${p})*(3-2*(${p}))`;
  const zExpr = `${relFrom.toFixed(6)}+(${relTo.toFixed(6)}-${relFrom.toFixed(6)})*${eased}`;

  // After focal pre-crop, pan around center with Remotion shift percentages.
  const maxShiftX = dirX * 2.1 * intensity;
  const maxShiftY = dirY * 1.4 * intensity;
  const xExpr = `(iw-iw/zoom)/2-(iw/zoom)*${(maxShiftX / 100).toFixed(6)}*${eased}`;
  const yExpr = `(ih-ih/zoom)/2-(ih/zoom)*${(maxShiftY / 100).toFixed(6)}*${eased}`;

  return [
    `scale=${preW}:${preH}:force_original_aspect_ratio=increase`,
    `crop=${preW}:${preH}:'(iw-ow)*${focalX.toFixed(4)}':'(ih-oh)*${focalY.toFixed(4)}'`,
    `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=${d}:s=${outW}x${outH}:fps=${fps}`,
    'setsar=1',
    'format=yuv420p',
  ].join(',');
}

/**
 * Hold frames for scene-arrive opacity (matches apps/video/src/transitions.ts).
 * Dissolve is a longer fade-in than fade; none is a hard cut.
 */
export function transitionHoldFrames(transition: Transition): number {
  if (transition === 'none') {
    return 0;
  }
  return transition === 'dissolve' ? 16 : 10;
}

/**
 * ffmpeg fade-in matching Remotion SceneArrive (opacity 0→1 over hold frames).
 * Sequential concat (no overlap) — same model as MemorialComposition Sequences.
 */
export function buildSceneArriveFadeFilter(transitionIn: Transition, fps: number): string | null {
  const hold = transitionHoldFrames(transitionIn);
  if (hold <= 0 || !(fps > 0)) {
    return null;
  }
  const durationSeconds = hold / fps;
  return `fade=t=in:st=0:d=${durationSeconds.toFixed(4)}`;
}

/** Prefer ceremony-readable serif fonts present on Linux CI / local hosts. */
const DRAWTEXT_FONT_CANDIDATES = [
  '/usr/share/fonts/truetype/noto/NotoSerif-Regular.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf',
  '/System/Library/Fonts/Supplemental/Times New Roman.ttf',
] as const;

let cachedDrawtextFont: string | null | undefined;

/**
 * Escape a string for ffmpeg drawtext `text='…'` (never log the source caption).
 */
export function escapeDrawtextValue(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/\n/g, ' ');
}

/** Map TimelineContract scene copy onto ffmpeg overlay roles (Remotion SafeType / MediaScene). */
export function sceneOverlaysFromTimelineScene(
  scene: TimelineContract['scenes'][number],
  locale: LaunchLanguage = 'en',
): SceneOverlayLine[] {
  switch (scene.type) {
    case 'intro': {
      // Remotion MemorialComposition: eyebrow=remembrance, title=displayName, subtitle=lifeSpan.
      const lines: SceneOverlayLine[] = [
        { text: REMEMBRANCE_BY_LOCALE[locale], role: 'eyebrow' },
        { text: scene.displayName, role: 'title' },
      ];
      if (scene.lifeSpanLabel?.trim()) {
        lines.push({ text: scene.lifeSpanLabel.trim(), role: 'subtitle' });
      }
      return lines;
    }
    case 'chapter':
      return [{ text: scene.title, role: 'title' }];
    case 'image':
    case 'video':
      return scene.caption?.trim() ? [{ text: scene.caption.trim(), role: 'caption' }] : [];
    case 'quote': {
      const lines: SceneOverlayLine[] = [{ text: `\u201C${scene.text}\u201D`, role: 'title' }];
      if (scene.attribution?.trim()) {
        lines.push({ text: scene.attribution.trim(), role: 'subtitle' });
      }
      return lines;
    }
    case 'outro':
      // Remotion MemorialComposition: eyebrow="MemorialVideo", title=closingLine.
      return [
        { text: 'MemorialVideo', role: 'eyebrow' },
        { text: scene.closingLine, role: 'title' },
      ];
    default:
      return [];
  }
}

export async function resolveDrawtextFontAbsolute(): Promise<string | null> {
  if (cachedDrawtextFont !== undefined) {
    return cachedDrawtextFont;
  }
  for (const candidate of DRAWTEXT_FONT_CANDIDATES) {
    try {
      await access(candidate);
      cachedDrawtextFont = candidate;
      return candidate;
    } catch {
      // try next
    }
  }
  cachedDrawtextFont = null;
  return null;
}

function escapeDrawtextFontfile(fontfile: string): string {
  return fontfile.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

/**
 * Presentation-only color grade from FilmStyleManifest (encode/preview — does not mutate library).
 */
export function buildFilmStyleGradeFilter(theme: FilmStyleManifest): string {
  const contrast = theme.gradeContrast.toFixed(3);
  const brightness = theme.gradeBrightness.toFixed(3);
  const saturation = theme.gradeSaturation.toFixed(3);
  const warmth = theme.gradeWarmth;
  const rs = warmth.toFixed(3);
  const bs = (-warmth * 0.85).toFixed(3);
  return [
    `eq=contrast=${contrast}:brightness=${brightness}:saturation=${saturation}`,
    `colorbalance=rs=${rs}:gs=0:bs=${bs}`,
  ].join(',');
}

/**
 * Soft film grain matching Remotion FilmGrain opacity.
 * Strength is derived from grainOpacity (0 = off).
 */
export function buildFilmStyleGrainFilter(theme: FilmStyleManifest, seed: number): string | null {
  const opacity = Math.min(0.2, Math.max(0, theme.grainOpacity));
  if (opacity <= 0.001) {
    return null;
  }
  // ffmpeg noise c0s/c1s ~0–100; map 0.01–0.2 opacity → ~2–14 strength.
  const strength = Math.max(1, Math.round(opacity * 70));
  const alls = Math.min(20, strength);
  const seedInt = Math.abs(seed >>> 0) % 100_000;
  return `noise=alls=${alls}:allf=t+u:c0_seed=${seedInt}:c1_seed=${(seedInt + 17) % 100_000}:c2_seed=${(seedInt + 41) % 100_000}`;
}

/**
 * Remotion MediaScene inset — editorial / spotlight pad onto mediaMatte; fullBleed = none.
 */
export function imageTreatmentInsetPx(
  treatment: FilmStyleManifest['imageTreatment'],
): number {
  if (treatment === 'editorial') return 48;
  if (treatment === 'spotlight') return 96;
  return 0;
}

/**
 * After cover/Ken Burns to timeline size, pad inward onto mediaMatte for editorial/spotlight.
 */
export function buildImageTreatmentPadFilter(
  width: number,
  height: number,
  theme: FilmStyleManifest,
): string | null {
  const inset = imageTreatmentInsetPx(theme.imageTreatment);
  if (inset <= 0) {
    return null;
  }
  const innerW = Math.max(2, width - inset * 2);
  const innerH = Math.max(2, height - inset * 2);
  const evenW = innerW % 2 === 0 ? innerW : innerW - 1;
  const evenH = innerH % 2 === 0 ? innerH : innerH - 1;
  const matte = cssColorToFfmpegHex(theme.mediaMatte) ?? '0x1C2430';
  return [
    `scale=${evenW}:${evenH}:force_original_aspect_ratio=increase`,
    `crop=${evenW}:${evenH}`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:${matte}`,
    'setsar=1',
  ].join(',');
}

/**
 * Remotion SafeType / MediaScene drawtext colors + sizes from FilmStyleManifest.
 * Title cards use ink/muted/accent on theme.background; captions follow captionTreatment.
 */
export function buildDrawtextFilters(
  overlays: SceneOverlayLine[],
  fontfile: string,
  theme: FilmStyleManifest,
): string {
  const font = escapeDrawtextFontfile(fontfile);
  const ink = cssColorToFfmpegHex(theme.ink) ?? '0xFFFFFF';
  const muted = cssColorToFfmpegHex(theme.muted) ?? ink;
  const accent = cssColorToFfmpegHex(theme.accent) ?? ink;
  const paper = cssColorToFfmpegHex(theme.paper) ?? '0xFFFFFF';
  // captionTreatment: matte → ink on dark; paper → light paper; minimal → soft muted.
  const captionColor =
    theme.captionTreatment === 'matte'
      ? ink
      : theme.captionTreatment === 'minimal'
        ? muted
        : paper;
  const titleSize =
    theme.chapterTreatment === 'bold'
      ? theme.titleSize + 4
      : theme.chapterTreatment === 'editorial'
        ? theme.titleSize
        : theme.titleSize;
  const eyebrowOffset = Math.round(titleSize * 0.55);
  const subtitleOffset = Math.max(56, Math.round(titleSize * 0.45));
  const cardStroke =
    theme.key === 'cinematic_dark' || theme.captionTreatment === 'matte'
      ? 'borderw=1:bordercolor=black@0.35'
      : 'borderw=0';
  const captionStroke =
    theme.captionTreatment === 'minimal'
      ? 'borderw=1:bordercolor=black@0.35'
      : 'borderw=2:bordercolor=black@0.55';
  const captionSize = theme.captionTreatment === 'minimal' ? 28 : 34;
  const parts: string[] = [];
  for (const line of overlays) {
    if (!line.text.trim()) continue;
    const raw =
      line.role === 'eyebrow' ? line.text.trim().toUpperCase() : line.text.trim();
    const escaped = escapeDrawtextValue(raw);
    if (line.role === 'caption') {
      parts.push(
        `drawtext=fontfile=${font}:text='${escaped}':fontcolor=${captionColor}:${captionStroke}:fontsize=${captionSize}:x=(w-text_w)/2:y=h-text_h-72`,
      );
    } else if (line.role === 'eyebrow') {
      parts.push(
        `drawtext=fontfile=${font}:text='${escaped}':fontcolor=${accent}:${cardStroke}:fontsize=28:x=(w-text_w)/2:y=(h-text_h)/2-${eyebrowOffset}`,
      );
    } else if (line.role === 'subtitle') {
      parts.push(
        `drawtext=fontfile=${font}:text='${escaped}':fontcolor=${muted}:${cardStroke}:fontsize=32:x=(w-text_w)/2:y=(h-text_h)/2+${subtitleOffset}`,
      );
    } else {
      const size = raw.length > 28 ? titleSize - 20 : titleSize;
      const xExpr =
        theme.chapterTreatment === 'editorial' ? '160' : '(w-text_w)/2';
      parts.push(
        `drawtext=fontfile=${font}:text='${escaped}':fontcolor=${ink}:${cardStroke}:fontsize=${size}:x=${xExpr}:y=(h-text_h)/2`,
      );
    }
  }
  return parts.join(',');
}

/** Remotion `Watermark.tsx` copy — CSS uppercases in Player; ffmpeg burns the same source string. */
export const PREVIEW_WATERMARK_TEXT = 'Preview — MemorialVideo';

/**
 * R-007 honesty: burn preview watermark when the job is preview or the timeline requests it.
 * Matches Remotion `encodeWithRemotion` forcing `watermark: true` for preview kind.
 */
export function shouldBurnPreviewWatermark(input: {
  kind?: 'preview' | 'final';
  watermark: boolean;
}): boolean {
  return input.kind === 'preview' || input.watermark;
}

/**
 * Remotion-parity preview watermark drawtext (bottom-right, ~56px pad, 22px).
 * Pure filter fragment (no labeled pads) for chaining onto a labeled video stream.
 */
export function buildPreviewWatermarkDrawtextFilter(fontfile: string): string {
  const font = escapeDrawtextFontfile(fontfile);
  const escaped = escapeDrawtextValue(PREVIEW_WATERMARK_TEXT);
  return `drawtext=fontfile=${font}:text='${escaped}':fontsize=22:fontcolor=white@0.55:borderw=1:bordercolor=black@0.4:x=w-text_w-56:y=h-text_h-56`;
}

/**
 * Burn-in AudioMix subtitle cues that are attached + burnIn onto a labeled video stream.
 * Cue times are absolute timeline seconds (post-concat). Pure filter string builder.
 */
export function buildSubtitleBurnInFilterChain(
  inputLabel: string,
  outputLabel: string,
  mix: AudioMixContract | undefined,
  fps: number,
  fontfile: string,
): { filter: string; burned: boolean } {
  if (!mix || !(fps > 0) || !fontfile) {
    return { filter: `[${inputLabel}]null[${outputLabel}]`, burned: false };
  }
  const cues = mix.subtitles
    .filter((track) => track.attached && track.burnIn)
    .flatMap((track) => track.cues)
    .filter((cue) => cue.text.trim().length > 0);
  if (cues.length === 0) {
    return { filter: `[${inputLabel}]null[${outputLabel}]`, burned: false };
  }
  let current = inputLabel;
  const parts: string[] = [];
  let written = 0;
  for (const cue of cues) {
    const start = cue.startFrame / fps;
    const end = cue.endFrame / fps;
    if (!(end > start)) continue;
    const escaped = escapeDrawtextValue(cue.text.trim());
    const font = escapeDrawtextFontfile(fontfile);
    const next = `sub${written}`;
    parts.push(
      `[${current}]drawtext=fontfile=${font}:text='${escaped}':fontsize=32:fontcolor=white:borderw=2:bordercolor=black@0.55:x=(w-text_w)/2:y=h-text_h-96:enable='between(t,${start.toFixed(4)},${end.toFixed(4)})'[${next}]`,
    );
    current = next;
    written += 1;
  }
  if (written === 0) {
    return { filter: `[${inputLabel}]null[${outputLabel}]`, burned: false };
  }
  parts.push(`[${current}]null[${outputLabel}]`);
  return { filter: parts.join(';'), burned: true };
}

export type LocalEncodeResult =
  | { ok: true; outputRelative: string; encoder: Exclude<LocalEncoderKind, 'unavailable'> }
  | { ok: false; reason: string; encoder: LocalEncoderKind };

function run(command: string, args: string[], timeoutMs: number): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let settled = false;
    const finish = (code: number, extra = '') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stderr: extra ? `${stderr}${extra}` : stderr });
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(124, '\ntimeout');
    }, timeoutMs);
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => {
      finish(127, `\n${err.message}`);
    });
    child.on('close', (code) => {
      finish(code ?? 1);
    });
  });
}

export function isLocalEncoderEnabled(): boolean {
  if (process.env.CREATOR_LOCAL_ENCODER === '0') {
    return false;
  }
  if (process.env.CREATOR_LOCAL_ENCODER === '1') {
    return true;
  }
  // Unit tests keep the marker→QC-fail honesty path unless explicitly opted in.
  if (process.env.VITEST === 'true') {
    return false;
  }
  return true;
}

export async function detectLocalEncoder(): Promise<{
  available: boolean;
  kind: LocalEncoderKind;
  ffmpeg: boolean;
  chrome: boolean;
  remotionOptIn: boolean;
}> {
  let ffmpeg = false;
  let chrome = false;
  try {
    const probe = await run('ffmpeg', ['-version'], 2000);
    ffmpeg = probe.code === 0;
  } catch {
    ffmpeg = false;
  }
  for (const candidate of ['/usr/local/bin/google-chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']) {
    try {
      await access(candidate);
      chrome = true;
      break;
    } catch {
      // continue
    }
  }
  // Remotion is explicit opt-in (CREATOR_USE_REMOTION=1). Auto-preferring Remotion when
  // system Chrome exists previously hung the first /api/worker/render-once for minutes
  // while Remotion downloaded chrome-headless-shell, then fell back to ffmpeg anyway.
  // Aligns with enqueue note + render.ts copy: optional CREATOR_USE_REMOTION=1.
  const remotionPreferred = process.env.CREATOR_USE_REMOTION === '1' && chrome;
  const kind: LocalEncoderKind =
    remotionPreferred && ffmpeg ? 'remotion' : ffmpeg ? 'ffmpeg' : 'unavailable';
  return {
    available: kind !== 'unavailable',
    kind,
    ffmpeg,
    chrome,
    remotionOptIn: remotionPreferred,
  };
}

/** Public src bound into TimelineContract for a local enhancement variant. */
export function enhancementVariantPublicPath(requestId: string): string {
  return `/api/enhancement/variant/${requestId}`;
}

/** Absolute bytes path for a local pixel-ops enhancement variant. */
export function enhancementVariantAbsolutePath(
  tributePublicId: string,
  requestId: string,
): string {
  return path.join(process.cwd(), '.data', 'enhancements', tributePublicId, `${requestId}.jpg`);
}

export async function resolveTimelineAssetPath(src: string, tributePublicId?: string): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith('/fixtures/')) {
    const absolute = path.join(CREATOR_ROOT, 'public', src.slice(1));
    try {
      await access(absolute);
      return absolute;
    } catch {
      return null;
    }
  }
  const apiMatch = src.match(/^\/api\/media\/(mv_[a-f0-9]{16})\/(mem_[a-zA-Z0-9_-]+)$/i);
  if (apiMatch) {
    const tributeId = apiMatch[1]!;
    const assetId = apiMatch[2]!;
    if (tributePublicId && tributeId !== tributePublicId) {
      return null;
    }
    const absolute = path.join(process.cwd(), '.data', 'media', tributeId, assetId);
    const normalized = `${absolute}.normalized.jpg`;
    try {
      await access(normalized);
      return normalized;
    } catch {
      // fall through to raw upload bytes
    }
    try {
      await access(absolute);
      return absolute;
    } catch {
      return null;
    }
  }
  // Encode-safe enhancement variants: TimelineContract stores the preview URL;
  // Remotion/ffmpeg resolve to .data/enhancements/{tribute}/{requestId}.jpg.
  const enhMatch = src.match(/^\/api\/enhancement\/variant\/(enh_[a-zA-Z0-9]+)$/i);
  if (enhMatch) {
    if (!tributePublicId) {
      return null;
    }
    const absolute = enhancementVariantAbsolutePath(tributePublicId, enhMatch[1]!);
    try {
      await access(absolute);
      return absolute;
    } catch {
      return null;
    }
  }
  // Relative variantPath as stored on the enhancement request (never leave encoder on a bare URL).
  if (
    src.startsWith('.data/enhancements/') ||
    src.startsWith('enhancements/') ||
    src.includes(`${path.sep}.data${path.sep}enhancements${path.sep}`) ||
    src.includes(`${path.sep}enhancements${path.sep}`)
  ) {
    const absolute = path.isAbsolute(src)
      ? src
      : path.join(
          /* turbopackIgnore: true */ process.cwd(),
          src.startsWith('.data/') ? src : path.join('.data', src),
        );
    if (tributePublicId && !absolute.includes(path.join('enhancements', tributePublicId))) {
      return null;
    }
    try {
      await access(absolute);
      return absolute;
    } catch {
      return null;
    }
  }
  if (path.isAbsolute(src)) {
    try {
      await access(src);
      return src;
    } catch {
      return null;
    }
  }
  return null;
}

async function collectSceneMedia(
  timeline: TimelineContract,
  tributePublicId?: string,
): Promise<SceneMediaInput[]> {
  const fps = timeline.fps;
  const manifest = resolveFilmStyleManifest(timeline.themeKey);
  const motionIntensity = manifest.motionIntensity;
  const medias: SceneMediaInput[] = [];
  for (const scene of timeline.scenes) {
    const durationSeconds = Math.max(scene.durationFrames / fps, 0.05);
    const overlays = sceneOverlaysFromTimelineScene(scene, timeline.locale);
    const transitionIn = scene.transitionIn;
    if (scene.type === 'image' || scene.type === 'video') {
      const resolved = await resolveTimelineAssetPath(scene.asset.src, tributePublicId);
      if (!resolved) {
        // Missing media → Remotion MediaScene matte, not title-card paper.
        medias.push({
          kind: 'color',
          durationSeconds,
          overlays,
          transitionIn,
          fillCss: manifest.mediaMatte,
        });
        continue;
      }
      const looksVideo =
        scene.type === 'video' || resolved.toLowerCase().endsWith('.mp4');
      medias.push({
        absolute: resolved,
        kind: looksVideo ? 'video' : 'image',
        durationSeconds,
        durationFrames: scene.durationFrames,
        overlays,
        transitionIn,
        // Image scenes carry Guided Variants / Studio crop; video uses Remotion cover center.
        crop: scene.type === 'image' ? scene.crop : undefined,
        // Remotion Ken Burns on image only (MediaScene skips motion for video).
        motionSeed: looksVideo ? undefined : sceneMotionSeed(timeline.seed, scene.id),
        motionIntensity: looksVideo ? undefined : motionIntensity,
      });
      continue;
    }
    // Keep intro/chapter/outro/quote duration in the READY MP4 so Output QC length matches TimelineContract.
    // Solid fill = FilmStyleManifest.background (Remotion SafeType AbsoluteFill).
    medias.push({
      kind: 'color',
      durationSeconds,
      overlays,
      transitionIn,
      fillCss: manifest.background,
    });
  }
  return medias;
}

async function pathIfReadable(absolute: string): Promise<string | null> {
  try {
    await access(absolute);
    return absolute;
  } catch {
    return null;
  }
}

/**
 * Resolve a catalog preview WAV for a development_only track id.
 * Licensed masters remain XB-002 — this only serves the synthetic fixture on disk.
 */
export async function resolveCatalogPreviewAbsolute(trackId: string): Promise<string | null> {
  if (!trackId) return null;
  try {
    const { catalogTrackById } = await import('@memorialvideo/domain');
    const track = catalogTrackById(trackId);
    if (!track || !track.licensedForPreview) {
      return null;
    }
    const fromCatalog = await pathIfReadable(path.join(VIDEO_PUBLIC, track.previewSrc));
    if (fromCatalog) return fromCatalog;
  } catch {
    // Domain import / catalog miss — fall through to synthetic fixture.
  }
  return pathIfReadable(SYNTHETIC_CATALOG_WAV);
}

/**
 * Map TimelineContract music / AudioMix src strings to absolute WAV bytes for local encode.
 * Supports `/api/music/preview?trackId=…`, video public fixtures, and absolute paths.
 */
export async function resolveMusicSrcAbsolute(
  src: string,
  trackIdHint?: string | null,
  tributePublicId?: string,
): Promise<string | null> {
  if (!src) return null;

  if (src.startsWith('/api/media/')) {
    return resolveTimelineAssetPath(src, tributePublicId);
  }

  if (src.startsWith('/api/music/preview')) {
    try {
      const url = new URL(src, 'http://creator.local');
      const trackId =
        url.searchParams.get('trackId') ?? url.searchParams.get('trackKey') ?? trackIdHint ?? '';
      return resolveCatalogPreviewAbsolute(trackId);
    } catch {
      return resolveCatalogPreviewAbsolute(trackIdHint ?? '');
    }
  }

  if (path.isAbsolute(src)) {
    return pathIfReadable(src);
  }

  if (src.startsWith('fixtures/') || src.startsWith('/fixtures/')) {
    const rel = src.startsWith('/') ? src.slice(1) : src;
    const underVideo = await pathIfReadable(path.join(VIDEO_PUBLIC, rel));
    if (underVideo) return underVideo;
    const underCreator = await pathIfReadable(path.join(CREATOR_ROOT, 'public', rel));
    if (underCreator) return underCreator;
  }

  // Remotion bundle rewrite / legacy bed — use synthetic catalog bytes when present.
  if (src.includes('bed.wav') || src.includes('music-synthetic')) {
    return pathIfReadable(SYNTHETIC_CATALOG_WAV);
  }

  if (src.startsWith('creator-assets/')) {
    return pathIfReadable(SYNTHETIC_CATALOG_WAV);
  }

  return null;
}

/**
 * Prefer AudioMixContract music clips, then legacy timeline.music.
 * Returns null when no resolvable soundtrack exists (caller may use sine fallback for QC audio).
 */
export async function resolveTimelineMusicAbsolutePath(
  timeline: TimelineContract,
): Promise<ResolvedTimelineMusic | null> {
  const mixTracks = timeline.audio?.tracks ?? [];
  for (const track of mixTracks) {
    if (track.kind !== 'music' || track.muted) continue;
    for (const clip of track.clips ?? []) {
      if (!clip.src) continue;
      const absolute = await resolveMusicSrcAbsolute(clip.src, timeline.music?.trackId);
      if (absolute) {
        return { absolute, source: 'audio_mix' };
      }
    }
  }

  if (timeline.music?.src) {
    const absolute = await resolveMusicSrcAbsolute(timeline.music.src, timeline.music.trackId);
    if (absolute) {
      return { absolute, source: 'legacy_music' };
    }
  }

  if (timeline.music?.trackId) {
    const absolute = await resolveCatalogPreviewAbsolute(timeline.music.trackId);
    if (absolute) {
      return { absolute, source: 'catalog_fixture' };
    }
  }

  return null;
}

/**
 * Resolve every unmuted AudioMix music clip (chapter slots, Guided Audio beds).
 * Falls back to a single full-timeline legacy/catalog clip when mix clips are absent.
 */
export async function resolveTimelineMusicClips(
  timeline: TimelineContract,
  tributePublicId?: string,
): Promise<ResolvedMusicClip[]> {
  const clips: ResolvedMusicClip[] = [];
  const mixTracks = timeline.audio?.tracks ?? [];
  for (const track of mixTracks) {
    if (track.kind !== 'music' || track.muted) continue;
    for (const clip of track.clips ?? []) {
      if (!clip.src) continue;
      const absolute = await resolveMusicSrcAbsolute(clip.src, timeline.music?.trackId, tributePublicId);
      if (!absolute) continue;
      clips.push({
        id: clip.id,
        absolute,
        startFrame: clip.startFrame,
        durationFrames: clip.durationFrames,
        gainDb: clip.gainDb + track.gainDb,
        fadeInFrames: clip.fadeInFrames,
        fadeOutFrames: clip.fadeOutFrames,
      });
    }
  }
  if (clips.length > 0) {
    return clips;
  }
  const legacy = await resolveTimelineMusicAbsolutePath(timeline);
  if (!legacy) {
    return [];
  }
  const frames = totalDurationFrames(timeline);
  return [
    {
      id: 'legacy_music_bed',
      absolute: legacy.absolute,
      startFrame: 0,
      durationFrames: frames > 0 ? frames : 1,
      gainDb: 0,
      fadeInFrames: timeline.music?.fadeInFrames ?? 0,
      fadeOutFrames: timeline.music?.fadeOutFrames ?? 0,
    },
  ];
}

/**
 * Resolve unmuted AudioMix speech + narration clips to absolute bytes for ffmpeg.
 * Uses timeline media paths, fixtures, and absolute WAV/mp4 sources.
 */
export async function resolveTimelineDialogueClips(
  timeline: TimelineContract,
  tributePublicId?: string,
): Promise<ResolvedDialogueClip[]> {
  const clips: ResolvedDialogueClip[] = [];
  const mixTracks = timeline.audio?.tracks ?? [];
  for (const track of mixTracks) {
    if ((track.kind !== 'speech' && track.kind !== 'narration') || track.muted) continue;
    for (const clip of track.clips ?? []) {
      if (!clip.src) continue;
      const fromMedia = await resolveTimelineAssetPath(clip.src, tributePublicId);
      const fromMusic = fromMedia ? null : await resolveMusicSrcAbsolute(clip.src, null);
      const absolute = fromMedia ?? fromMusic;
      if (!absolute) continue;
      clips.push({
        id: clip.id,
        absolute,
        startFrame: clip.startFrame,
        durationFrames: clip.durationFrames,
        gainDb: clip.gainDb + track.gainDb,
        kind: track.kind,
      });
    }
  }
  return clips;
}

function buildDialogueClipAudioFilters(input: {
  clips: ResolvedDialogueClip[];
  firstInputIndex: number;
  fps: number;
  totalSeconds: number;
}): string {
  const { clips, firstInputIndex, fps, totalSeconds } = input;
  const parts: string[] = [];
  clips.forEach((clip, i) => {
    const inputIdx = firstInputIndex + i;
    const durSec = Math.max(clip.durationFrames / fps, 0.05);
    const startMs = Math.max(0, Math.round((clip.startFrame / fps) * 1000));
    const gain = dbToLinear(clip.gainDb);
    parts.push(
      `[${inputIdx}:a]atrim=0:${durSec.toFixed(4)},asetpts=PTS-STARTPTS,volume=${gain.toFixed(6)},adelay=${startMs}|${startMs},apad=whole_dur=${totalSeconds.toFixed(4)}[dlg${i}]`,
    );
  });
  return parts.join(';');
}

/**
 * Build ffmpeg volume filter chain matching Remotion ducking hold + attack/release.
 * Regions are assumed non-overlapping (domain mergeSpeechRegions). Pure — no I/O.
 */
export function buildDuckingAudioFilterChain(
  inputLabel: string,
  outputLabel: string,
  mix: AudioMixContract | undefined,
  fps: number,
): { filter: string; ducked: boolean } {
  if (!mix?.ducking.enabled || mix.ducking.regions.length === 0 || !(fps > 0)) {
    return { filter: `[${inputLabel}]anull[${outputLabel}]`, ducked: false };
  }
  const attack = mix.ducking.attackFrames;
  const release = mix.ducking.releaseFrames;
  let current = inputLabel;
  const parts: string[] = [];
  let index = 0;
  for (const region of mix.ducking.regions) {
    const duckLin = dbToLinear(region.musicGainDb);
    const holdStart = region.startFrame / fps;
    const holdEnd = region.endFrame / fps;
    if (!(holdEnd > holdStart)) {
      continue;
    }
    const attackStart = Math.max(0, (region.startFrame - attack) / fps);
    const releaseEnd = (region.endFrame + release) / fps;

    if (attack > 0 && attackStart < holdStart) {
      const next = `dk${index}a`;
      const span = Math.max(holdStart - attackStart, 0.001);
      const expr = `1+(${duckLin.toFixed(6)}-1)*((t-${attackStart.toFixed(4)})/${span.toFixed(4)})`;
      parts.push(
        `[${current}]volume=${expr}:eval=frame:enable='between(t,${attackStart.toFixed(4)},${holdStart.toFixed(4)})'[${next}]`,
      );
      current = next;
    }
    {
      const next = `dk${index}h`;
      parts.push(
        `[${current}]volume=${duckLin.toFixed(6)}:enable='between(t,${holdStart.toFixed(4)},${holdEnd.toFixed(4)})'[${next}]`,
      );
      current = next;
    }
    if (release > 0 && releaseEnd > holdEnd) {
      const next = `dk${index}r`;
      const span = Math.max(releaseEnd - holdEnd, 0.001);
      const expr = `${duckLin.toFixed(6)}+(1-${duckLin.toFixed(6)})*((t-${holdEnd.toFixed(4)})/${span.toFixed(4)})`;
      parts.push(
        `[${current}]volume=${expr}:eval=frame:enable='between(t,${holdEnd.toFixed(4)},${releaseEnd.toFixed(4)})'[${next}]`,
      );
      current = next;
    }
    index += 1;
  }
  if (index === 0) {
    return { filter: `[${inputLabel}]anull[${outputLabel}]`, ducked: false };
  }
  if (current !== outputLabel) {
    parts.push(`[${current}]anull[${outputLabel}]`);
  }
  return { filter: parts.join(';'), ducked: true };
}

function buildMusicClipAudioFilters(input: {
  clips: ResolvedMusicClip[];
  firstInputIndex: number;
  fps: number;
  totalSeconds: number;
}): string {
  const { clips, firstInputIndex, fps, totalSeconds } = input;
  const parts: string[] = [];
  const mixLabels: string[] = [];
  clips.forEach((clip, i) => {
    const inputIdx = firstInputIndex + i;
    const durSec = Math.max(clip.durationFrames / fps, 0.05);
    const startMs = Math.max(0, Math.round((clip.startFrame / fps) * 1000));
    const gain = dbToLinear(clip.gainDb);
    const fadeIn = Math.max(0, clip.fadeInFrames / fps);
    const fadeOut = Math.max(0, clip.fadeOutFrames / fps);
    const fadeOutStart = Math.max(0, durSec - fadeOut);
    let chain = `[${inputIdx}:a]atrim=0:${durSec.toFixed(4)},asetpts=PTS-STARTPTS,volume=${gain.toFixed(6)}`;
    if (fadeIn > 0) {
      chain += `,afade=t=in:st=0:d=${fadeIn.toFixed(4)}`;
    }
    if (fadeOut > 0) {
      chain += `,afade=t=out:st=${fadeOutStart.toFixed(4)}:d=${Math.min(fadeOut, durSec).toFixed(4)}`;
    }
    chain += `,adelay=${startMs}|${startMs},apad=whole_dur=${totalSeconds.toFixed(4)}[ac${i}]`;
    parts.push(chain);
    mixLabels.push(`[ac${i}]`);
  });
  if (clips.length === 1) {
    parts.push(`[ac0]anull[amixed]`);
  } else {
    parts.push(
      `${mixLabels.join('')}amix=inputs=${clips.length}:duration=longest:dropout_transition=0:normalize=0[amixed]`,
    );
  }
  return parts.join(';');
}

/**
 * Probe a real media file with ffprobe. Never invents dimensions/audio.
 */
export async function probeWithFfprobe(absolutePath: string): Promise<OutputProbe> {
  try {
    const info = await stat(absolutePath);
    if (info.size <= 0) {
      return { exists: false, sizeBytes: 0 };
    }
    const json = await new Promise<string>((resolve) => {
      const child = spawn(
        'ffprobe',
        [
          '-v',
          'error',
          '-show_entries',
          'stream=codec_type,width,height',
          '-show_entries',
          'format=duration,format_name',
          '-of',
          'json',
          absolutePath,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let stdout = '';
      child.stdout.on('data', (c: Buffer) => {
        stdout += c.toString('utf8');
      });
      child.on('close', () => resolve(stdout));
      child.on('error', () => resolve(''));
    });
    const parsed = JSON.parse(json) as {
      streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
      format?: { duration?: string; format_name?: string };
    };
    const video = parsed.streams?.find((s) => s.codec_type === 'video');
    const audio = parsed.streams?.find((s) => s.codec_type === 'audio');
    const formatName = parsed.format?.format_name ?? '';
    const container = formatName.includes('mp4') || formatName.includes('mov') ? 'mp4' : formatName || undefined;
    const durationSeconds = parsed.format?.duration ? Number.parseFloat(parsed.format.duration) : undefined;
    return {
      exists: true,
      sizeBytes: info.size,
      width: video?.width,
      height: video?.height,
      hasVideo: Boolean(video),
      hasAudio: Boolean(audio),
      container,
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : undefined,
    };
  } catch {
    return { exists: false, sizeBytes: 0 };
  }
}

export async function encodeWithFfmpeg(input: {
  timeline: TimelineContract;
  outputAbsolute: string;
  tributePublicId?: string;
  /** When omitted, only `timeline.watermark` gates burn-in (legacy callers). */
  kind?: 'preview' | 'final';
}): Promise<{ ok: true; audioSource: FfmpegAudioSource } | { ok: false; reason: string }> {
  const fps = input.timeline.fps;
  const durationSeconds = totalDurationFrames(input.timeline) / fps;
  if (!(durationSeconds > 0)) {
    return { ok: false, reason: 'zero_duration' };
  }
  await mkdir(path.dirname(input.outputAbsolute), { recursive: true });
  const medias = await collectSceneMedia(input.timeline, input.tributePublicId);
  const width = input.timeline.width;
  const height = input.timeline.height;
  const filmStyle = resolveFilmStyleManifest(input.timeline.themeKey);
  const musicClips = await resolveTimelineMusicClips(input.timeline, input.tributePublicId);
  const dialogueClips = await resolveTimelineDialogueClips(input.timeline, input.tributePublicId);
  const fontfile = await resolveDrawtextFontAbsolute();
  const args: string[] = ['-y'];
  let videoInputCount = 0;
  if (medias.length === 0) {
    args.push(
      '-f',
      'lavfi',
      '-i',
      buildThemeLavfiColorSource({
        cssColor: filmStyle.background,
        width,
        height,
        durationSeconds,
      }),
    );
    videoInputCount = 1;
  } else {
    for (const media of medias) {
      if (media.kind === 'color') {
        args.push(
          '-f',
          'lavfi',
          '-i',
          buildThemeLavfiColorSource({
            cssColor: media.fillCss,
            width,
            height,
            durationSeconds: media.durationSeconds,
            fallbackCss: filmStyle.background,
          }),
        );
      } else if (media.kind === 'image') {
        // Stills must loop; short video memories must not — they play their own frames.
        args.push('-loop', '1', '-t', media.durationSeconds.toFixed(3), '-i', media.absolute);
      } else {
        args.push('-t', media.durationSeconds.toFixed(3), '-i', media.absolute);
      }
    }
    videoInputCount = medias.length;
  }

  // Prefer family-applied Ceremony Music / Guided Audio over a mock sine bed.
  // Honor music placement/gain/fades/ducking and mux speech/narration dialogue clips
  // so default ffmpeg READY matches AudioMixContract (Remotion remains opt-in).
  // Burn TimelineContract scene captions/titles (+ AudioMix burn-in cues) via drawtext
  // so Cinema Remotion Player copy is not dropped on the default ffmpeg READY path.
  // Honor Guided/Studio transitionIn (fade/dissolve) via scene-arrive fade — Remotion
  // SceneArrive parity; hard concat alone silently dropped family transition edits.
  // Honor Guided Variants / Remotion cover framing (focal + zoom) — letterbox/pad
  // silently dropped vertical/square crops on the default ffmpeg READY path.
  // Honor Remotion MediaScene Ken Burns on image scenes (seeded scale + pan) so ceremony
  // download/Pack MP4 matches Cinema Player motion instead of static cover stills.
  // Honor R-007 preview watermark (Remotion Watermark overlay) on preview / watermarked timelines.
  // Honor FilmStyleManifest on title-card lavfi fills + drawtext (ink/muted/accent/sizes)
  // and Remotion “In remembrance” / MemorialVideo eyebrows — no more hardcoded stone + white.
  let audioSource: FfmpegAudioSource = 'sine_fallback';
  const filterParts: string[] = [];
  let videoMap = '0:v:0';
  let audioMap = '1:a:0';
  const burnPreviewWatermark = shouldBurnPreviewWatermark({
    kind: input.kind,
    watermark: input.timeline.watermark,
  });
  const colorScale = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p`;
  const defaultCover = buildSceneCoverScaleFilter(width, height, undefined, fps);

  const styleGrade = buildFilmStyleGradeFilter(filmStyle);
  const styleGrain = buildFilmStyleGrainFilter(filmStyle, input.timeline.seed);
  const treatmentPad = buildImageTreatmentPadFilter(width, height, filmStyle);
  const beautyChain = [
    styleGrade,
    treatmentPad,
    styleGrain,
  ]
    .filter((part): part is string => Boolean(part))
    .join(',');
  const beautySuffix = beautyChain ? `,${beautyChain}` : '';

  const sceneVideoFilter = (index: number, media: SceneMediaInput, outLabel: string): string => {
    const dur = media.durationSeconds.toFixed(4);
    const overlayChain =
      fontfile && media.overlays.length > 0
        ? `,${buildDrawtextFilters(media.overlays, fontfile, filmStyle)}`
        : '';
    const arrive = buildSceneArriveFadeFilter(media.transitionIn, fps);
    const fadeChain = arrive ? `,${arrive}` : '';
    if (media.kind === 'color') {
      // Solid slots are already timeline-sized; pad is a no-op safety.
      // Title cards skip image grade/grain so type stays crisp on paper.
      return `[${index}:v]${colorScale}${overlayChain}${fadeChain}[${outLabel}]`;
    }
    if (media.kind === 'video') {
      // Trim long clips; hold last frame when the source is shorter than the scene slot.
      // Video stays static cover — Remotion MediaScene does not Ken Burns video.
      return `[${index}:v]${defaultCover}${beautySuffix},trim=duration=${dur},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${dur},trim=duration=${dur},setpts=PTS-STARTPTS${overlayChain}${fadeChain}[${outLabel}]`;
    }
    // Image: seeded Ken Burns (zoompan) matching Remotion motion.ts; falls back to static cover
    // when motionIntensity is 0. zoompan emits durationFrames so still timing stays exact.
    // Then full FilmStyleManifest tokens: grade + imageTreatment + grain.
    const kenBurns = buildSceneKenBurnsFilter(
      width,
      height,
      media.crop,
      fps,
      media.durationFrames,
      media.motionSeed ?? 1,
      media.motionIntensity ?? 0,
    );
    return `[${index}:v]${kenBurns}${beautySuffix}${overlayChain}${fadeChain}[${outLabel}]`;
  };

  if (medias.length > 1) {
    const scaled = medias.map((media, i) => sceneVideoFilter(i, media, `v${i}`));
    const concatInputs = medias.map((_, i) => `[v${i}]`).join('');
    filterParts.push(`${scaled.join(';')};${concatInputs}concat=n=${medias.length}:v=1:a=0[vbase]`);
    videoMap = '[vbase]';
  } else if (medias.length === 1) {
    filterParts.push(sceneVideoFilter(0, medias[0]!, 'vbase'));
    videoMap = '[vbase]';
  }

  if (fontfile && videoMap === '[vbase]') {
    const subs = buildSubtitleBurnInFilterChain(
      'vbase',
      'vout',
      input.timeline.audio,
      fps,
      fontfile,
    );
    if (subs.burned) {
      filterParts.push(subs.filter);
      videoMap = '[vout]';
    } else {
      // Keep a stable final label when no cue burn-in is needed.
      filterParts.push(`[vbase]null[vout]`);
      videoMap = '[vout]';
    }
  } else if (fontfile && burnPreviewWatermark && videoMap === '0:v:0') {
    // Solid-color / no-scene-filter path still needs a labeled stream for watermark burn-in.
    filterParts.push(`[0:v]${colorScale}[vout]`);
    videoMap = '[vout]';
  }

  if (fontfile && burnPreviewWatermark && videoMap.startsWith('[') && videoMap.endsWith(']')) {
    const src = videoMap.slice(1, -1);
    filterParts.push(`[${src}]${buildPreviewWatermarkDrawtextFilter(fontfile)}[vwm]`);
    videoMap = '[vwm]';
  }

  let nextInputIndex = videoInputCount;
  let musicLabel: string | null = null;
  let ducked = false;

  if (musicClips.length > 0) {
    for (const clip of musicClips) {
      args.push('-stream_loop', '-1', '-i', clip.absolute);
    }
    filterParts.push(
      buildMusicClipAudioFilters({
        clips: musicClips,
        firstInputIndex: nextInputIndex,
        fps,
        totalSeconds: durationSeconds,
      }),
    );
    nextInputIndex += musicClips.length;
    const duck = buildDuckingAudioFilterChain('amixed', 'amusic', input.timeline.audio, fps);
    filterParts.push(duck.filter);
    musicLabel = 'amusic';
    ducked = duck.ducked;
  }

  if (dialogueClips.length > 0) {
    for (const clip of dialogueClips) {
      args.push('-i', clip.absolute);
    }
    filterParts.push(
      buildDialogueClipAudioFilters({
        clips: dialogueClips,
        firstInputIndex: nextInputIndex,
        fps,
        totalSeconds: durationSeconds,
      }),
    );
    nextInputIndex += dialogueClips.length;
    const dlgLabels = dialogueClips.map((_, i) => `[dlg${i}]`);
    if (dialogueClips.length === 1) {
      filterParts.push(`[dlg0]anull[adialogue]`);
    } else {
      filterParts.push(
        `${dlgLabels.join('')}amix=inputs=${dialogueClips.length}:duration=longest:dropout_transition=0:normalize=0[adialogue]`,
      );
    }
  }

  if (musicLabel && dialogueClips.length > 0) {
    filterParts.push(
      `[${musicLabel}][adialogue]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[aout]`,
    );
    audioSource = ducked ? 'timeline_mix_ducked' : 'timeline_mix';
    audioMap = '[aout]';
  } else if (musicLabel) {
    filterParts.push(`[${musicLabel}]anull[aout]`);
    audioSource = ducked ? 'timeline_music_ducked' : 'timeline_music';
    audioMap = '[aout]';
  } else if (dialogueClips.length > 0) {
    filterParts.push(`[adialogue]anull[aout]`);
    audioSource = 'timeline_dialogue';
    audioMap = '[aout]';
  } else {
    args.push('-f', 'lavfi', '-i', `sine=frequency=196:duration=${durationSeconds.toFixed(3)}`);
    audioMap = `${nextInputIndex}:a:0`;
  }

  if (filterParts.length > 0) {
    args.push('-filter_complex', filterParts.join(';'), '-map', videoMap, '-map', audioMap);
  } else {
    args.push('-vf', defaultCover, '-map', '0:v:0', '-map', audioMap);
  }

  args.push(
    '-t',
    durationSeconds.toFixed(3),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    '-movflags',
    '+faststart',
    input.outputAbsolute,
  );

  // Local albums (30 photos plus short clips) outlast a fixed two-minute kill.
  // veryfast keeps 1080p H.264/AAC; it does not change the TimelineContract.
  args.splice(args.indexOf('-c:v'), 0, '-preset', 'veryfast');
  const encodeBudgetMs = Math.min(20 * 60_000, Math.max(120_000, Math.ceil(durationSeconds * 8_000)));
  const result = await run('ffmpeg', args, encodeBudgetMs);
  if (result.code !== 0) {
    return { ok: false, reason: `ffmpeg_failed:${result.code}` };
  }
  const probe = await probeWithFfprobe(input.outputAbsolute);
  if (!probe.exists || !probe.hasVideo) {
    return { ok: false, reason: 'ffmpeg_unreadable' };
  }
  return { ok: true, audioSource };
}

async function publishToBundle(serveUrl: string, sourceAbsolute: string, relativePublicPath: string): Promise<void> {
  const destination = path.join(serveUrl, 'public', relativePublicPath);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(sourceAbsolute, destination);
}

/**
 * Publish AudioMix music/speech/narration clip bytes (+ narration takes) into a Remotion
 * bundle public/ tree and rewrite srcs to staticFile-relative paths.
 *
 * encodeWithRemotion already flattens a single bed.wav into timeline.music.src, but when
 * `timeline.audio` is present MemorialComposition uses AudioMixLayer instead of music.src —
 * missing published clip bytes would make staticFile resolve fail under CREATOR_USE_REMOTION=1.
 */
export async function publishAudioMixToBundle(input: {
  serveUrl: string;
  mix: AudioMixContract;
  tributePublicId?: string;
  trackIdHint?: string | null;
}): Promise<AudioMixContract> {
  const rewrittenTracks = [];
  for (const track of input.mix.tracks) {
    const rewrittenClips = [];
    for (const clip of track.clips) {
      if (!clip.src) {
        rewrittenClips.push(clip);
        continue;
      }
      // Prefer media/storage resolution; fall back to catalog/preview music paths.
      const fromMedia = await resolveTimelineAssetPath(clip.src, input.tributePublicId);
      const fromMusic = fromMedia
        ? null
        : await resolveMusicSrcAbsolute(clip.src, input.trackIdHint);
      const absolute = fromMedia ?? fromMusic;
      if (!absolute) {
        rewrittenClips.push(clip);
        continue;
      }
      const ext = path.extname(absolute) || '.wav';
      const rel = `creator-assets/mix/${track.id}/${clip.id}${ext}`;
      await publishToBundle(input.serveUrl, absolute, rel);
      rewrittenClips.push({ ...clip, src: rel });
    }
    rewrittenTracks.push({ ...track, clips: rewrittenClips });
  }

  const rewrittenTakes = [];
  for (const take of input.mix.narrationTakes) {
    if (!take.src) {
      rewrittenTakes.push(take);
      continue;
    }
    const fromMedia = await resolveTimelineAssetPath(take.src, input.tributePublicId);
    const fromMusic = fromMedia ? null : await resolveMusicSrcAbsolute(take.src, null);
    const absolute = fromMedia ?? fromMusic;
    if (!absolute) {
      rewrittenTakes.push(take);
      continue;
    }
    const ext = path.extname(absolute) || '.wav';
    const rel = `creator-assets/mix/narration-takes/${take.id}${ext}`;
    await publishToBundle(input.serveUrl, absolute, rel);
    rewrittenTakes.push({ ...take, src: rel });
  }

  return {
    ...input.mix,
    tracks: rewrittenTracks,
    narrationTakes: rewrittenTakes,
  };
}

async function encodeWithRemotion(input: {
  timeline: TimelineContract;
  outputAbsolute: string;
  kind: 'preview' | 'final';
  tributePublicId?: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await access(VIDEO_ENTRY);
  } catch {
    return { ok: false, reason: 'video_entry_missing' };
  }

  const { bundle } = await import('@remotion/bundler');
  const { renderMedia, selectComposition } = await import('@remotion/renderer');

  const durationSeconds = totalDurationFrames(input.timeline) / input.timeline.fps;
  const work = await mkdtemp(path.join(tmpdir(), 'mv-creator-rem-'));
  try {
    const bedWav = path.join(work, 'bed.wav');
    const timelineMusic = await resolveTimelineMusicAbsolutePath(input.timeline);
    const bedSource = timelineMusic?.absolute ?? SYNTHETIC_CATALOG_WAV;
    let bedOk = false;
    try {
      await access(bedSource);
      const copied = await run(
        'ffmpeg',
        ['-y', '-stream_loop', '-1', '-i', bedSource, '-t', Math.max(durationSeconds, 1).toFixed(3), bedWav],
        30_000,
      );
      bedOk = copied.code === 0;
    } catch {
      bedOk = false;
    }
    if (!bedOk) {
      const bed = await run(
        'ffmpeg',
        ['-y', '-f', 'lavfi', '-i', `sine=frequency=220:duration=${Math.max(durationSeconds, 1).toFixed(3)}`, bedWav],
        30_000,
      );
      if (bed.code !== 0) {
        return { ok: false, reason: 'bed_audio_failed' };
      }
    }

    const serveUrl = await bundle({
      entryPoint: VIDEO_ENTRY,
      onProgress: () => undefined,
    });

    const rewrittenScenes = [];
    for (const scene of input.timeline.scenes) {
      if (scene.type !== 'image' && scene.type !== 'video') {
        rewrittenScenes.push(scene);
        continue;
      }
      const absolute = await resolveTimelineAssetPath(scene.asset.src, input.tributePublicId);
      if (!absolute) {
        rewrittenScenes.push(scene);
        continue;
      }
      const ext = path.extname(absolute) || '.png';
      const rel = `creator-assets/${scene.asset.assetId}${ext}`;
      await publishToBundle(serveUrl, absolute, rel);
      rewrittenScenes.push({
        ...scene,
        asset: { ...scene.asset, src: rel },
      });
    }

    await publishToBundle(serveUrl, bedWav, 'creator-assets/bed.wav');
    // When AudioMix is present, MemorialComposition uses AudioMixLayer (not music.src).
    // Publish mix clip/take bytes so staticFile srcs resolve under CREATOR_USE_REMOTION=1.
    const rewrittenAudio = input.timeline.audio
      ? await publishAudioMixToBundle({
          serveUrl,
          mix: input.timeline.audio,
          tributePublicId: input.tributePublicId,
          trackIdHint: input.timeline.music?.trackId,
        })
      : undefined;
    const renderTimeline = parseTimelineContract({
      ...input.timeline,
      scenes: rewrittenScenes,
      ...(rewrittenAudio ? { audio: rewrittenAudio } : {}),
      music: {
        trackId: input.timeline.music?.trackId ?? 'local-bed',
        src: 'creator-assets/bed.wav',
        fadeInFrames: 15,
        fadeOutFrames: 30,
      },
      watermark: input.kind === 'preview' ? true : input.timeline.watermark,
    });

    const compositionId = input.kind === 'preview' ? 'MemorialGolden' : 'MemorialFull';
    // Refuse silent multi-minute Chromium downloads inside a worker tick — caller
    // must have a usable browser already (or we fail fast → ffmpeg fallback).
    const refuseBrowserDownload = (): {
      onProgress: () => void;
      version: string | null;
    } => {
      throw new Error('remotion_browser_download_refused');
    };
    const composition = await selectComposition({
      serveUrl,
      id: compositionId,
      inputProps: renderTimeline,
      onBrowserDownload: refuseBrowserDownload,
    });
    await mkdir(path.dirname(input.outputAbsolute), { recursive: true });
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      audioCodec: 'aac',
      outputLocation: input.outputAbsolute,
      inputProps: renderTimeline,
      concurrency: 1,
      timeoutInMilliseconds: 180_000,
      onBrowserDownload: refuseBrowserDownload,
      chromiumOptions: {
        enableMultiProcessOnLinux: false,
        gl: 'angle',
      },
    });
    const probe = await probeWithFfprobe(input.outputAbsolute);
    if (!probe.exists || !probe.hasVideo) {
      return { ok: false, reason: 'remotion_unreadable' };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message.slice(0, 160) : 'remotion_failed',
    };
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Local READY path: ffmpeg slideshow of real stills + AAC by default.
 * Opt into Remotion with CREATOR_USE_REMOTION=1 when Chrome is present; on Remotion
 * failure, fall back to ffmpeg. Never invents QC-ready marker bytes.
 */
export async function encodeTimelineLocally(input: {
  timeline: TimelineContract;
  jobId: string;
  kind: 'preview' | 'final';
  tributePublicId?: string;
}): Promise<LocalEncodeResult> {
  if (!isLocalEncoderEnabled()) {
    return { ok: false, reason: 'encoder_disabled', encoder: 'unavailable' };
  }
  const detection = await detectLocalEncoder();
  if (!detection.ffmpeg) {
    return { ok: false, reason: 'ffmpeg_missing', encoder: 'unavailable' };
  }

  const relative = path.join('.data', 'renders', `${input.jobId}.mp4`);
  const absolute = path.join(process.cwd(), relative);
  await mkdir(path.dirname(absolute), { recursive: true });

  if (detection.kind === 'remotion') {
    const remotion = await encodeWithRemotion({
      timeline: input.timeline,
      outputAbsolute: absolute,
      kind: input.kind,
      tributePublicId: input.tributePublicId,
    });
    if (remotion.ok) {
      return { ok: true, outputRelative: relative, encoder: 'remotion' };
    }
  }

  const ffmpeg = await encodeWithFfmpeg({
    timeline: input.timeline,
    outputAbsolute: absolute,
    tributePublicId: input.tributePublicId,
    kind: input.kind,
  });
  if (!ffmpeg.ok) {
    return { ok: false, reason: ffmpeg.reason, encoder: 'ffmpeg' };
  }
  return { ok: true, outputRelative: relative, encoder: 'ffmpeg' };
}
