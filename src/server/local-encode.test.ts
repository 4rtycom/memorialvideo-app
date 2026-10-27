import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parseTimelineContract,
  resolveFilmStyleManifest,
  totalDurationFrames,
} from '@memorialvideo/contracts';
import { evaluateOutputQc } from '@memorialvideo/domain';

describe('creator local READY encode + download gate', () => {
  let cwd: string;
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-creator-enc-'));
    cwd = process.cwd();
    process.chdir(dataRoot);
    vi.resetModules();
    process.env.APP_ENV = 'local';
    process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3002';
    process.env.CREATOR_LOCAL_ENCODER = '1';
    process.env.CREATOR_USE_REMOTION = '0';
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(dataRoot, { recursive: true, force: true });
    vi.resetModules();
    delete process.env.CREATOR_LOCAL_ENCODER;
    delete process.env.CREATOR_USE_REMOTION;
  });

  it('defaults to ffmpeg unless CREATOR_USE_REMOTION=1 (no silent Chromium download)', async () => {
    delete process.env.CREATOR_USE_REMOTION;
    const encode = await import('./local-encode');
    const detection = await encode.detectLocalEncoder();
    expect(detection.ffmpeg).toBe(true);
    expect(detection.kind).toBe('ffmpeg');
    expect(detection.remotionOptIn).toBe(false);

    process.env.CREATOR_USE_REMOTION = '1';
    vi.resetModules();
    const encodeOptIn = await import('./local-encode');
    const opted = await encodeOptIn.detectLocalEncoder();
    // Opt-in only flips remotion when Chrome is present on the host.
    if (opted.chrome) {
      expect(opted.remotionOptIn).toBe(true);
      expect(opted.kind).toBe('remotion');
    } else {
      expect(opted.remotionOptIn).toBe(false);
      expect(opted.kind).toBe('ffmpeg');
    }
    process.env.CREATOR_USE_REMOTION = '0';
  });

  it('encodes a real 1080p H.264/AAC MP4 that passes Output QC', async () => {
    const encode = await import('./local-encode');
    const detection = await encode.detectLocalEncoder();
    expect(detection.ffmpeg).toBe(true);

    const timeline = parseTimelineContract({
      schemaVersion: 1,
      fps: 30,
      width: 1920,
      height: 1080,
      seed: 1,
      locale: 'en',
      themeKey: 'timeless',
      styleManifestVersion: 1,
      watermark: false,
      displayName: 'Encode Person',
      scenes: [
        {
          id: 'intro',
          type: 'intro',
          durationFrames: 30,
          displayName: 'Encode Person',
          transitionIn: 'fade',
          transitionOut: 'fade',
        },
        {
          id: 'image-1',
          type: 'image',
          durationFrames: 60,
          asset: {
            assetId: 'mem_fixture_a',
            src: path.join(cwd, 'apps/creator/public/fixtures/memory-a.png'),
          },
          caption: 'Still',
          transitionIn: 'fade',
          transitionOut: 'fade',
        },
      ],
    });

    const out = path.join(dataRoot, 'out.mp4');
    const result = await encode.encodeWithFfmpeg({ timeline, outputAbsolute: out });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.audioSource).toBe('sine_fallback');
    }
    const probe = await encode.probeWithFfprobe(out);
    const qc = evaluateOutputQc({
      probe,
      expectedDurationSeconds: totalDurationFrames(timeline) / timeline.fps,
      requireAudio: true,
      expectedWidth: 1920,
      expectedHeight: 1080,
    });
    expect(qc.ready).toBe(true);
    expect(probe.hasAudio).toBe(true);
    expect(probe.container).toBe('mp4');
  }, 60_000);

  it('maps TimelineContract scene copy and escapes drawtext / burn-in cue filters', async () => {
    const encode = await import('./local-encode');
    expect(encode.escapeDrawtextValue(`O'Brien: 100%`)).toBe(`O\\'Brien\\: 100\\%`);
    expect(encode.sceneOverlaysFromTimelineScene({
      id: 'intro',
      type: 'intro',
      durationFrames: 30,
      displayName: 'Encode Person',
      lifeSpanLabel: '1948–2026',
      transitionIn: 'fade',
      transitionOut: 'fade',
    }, 'en')).toEqual([
      { text: 'In remembrance', role: 'eyebrow' },
      { text: 'Encode Person', role: 'title' },
      { text: '1948–2026', role: 'subtitle' },
    ]);
    expect(
      encode.sceneOverlaysFromTimelineScene(
        {
          id: 'intro-nl',
          type: 'intro',
          durationFrames: 30,
          displayName: 'Naam',
          transitionIn: 'fade',
          transitionOut: 'fade',
        },
        'nl',
      ),
    ).toEqual([
      { text: 'Ter herinnering', role: 'eyebrow' },
      { text: 'Naam', role: 'title' },
    ]);
    expect(
      encode.sceneOverlaysFromTimelineScene({
        id: 'outro-1',
        type: 'outro',
        durationFrames: 30,
        closingLine: 'Always remembered',
        transitionIn: 'fade',
        transitionOut: 'fade',
      }),
    ).toEqual([
      { text: 'MemorialVideo', role: 'eyebrow' },
      { text: 'Always remembered', role: 'title' },
    ]);
    expect(
      encode.sceneOverlaysFromTimelineScene({
        id: 'image-1',
        type: 'image',
        durationFrames: 60,
        asset: { assetId: 'a', src: '/x.png' },
        caption: 'Still moment',
        transitionIn: 'fade',
        transitionOut: 'fade',
      }),
    ).toEqual([{ text: 'Still moment', role: 'caption' }]);

    const font = '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf';
    const burned = encode.buildSubtitleBurnInFilterChain(
      'vbase',
      'vout',
      {
        schemaVersion: 1,
        revision: 1,
        masterProfile: 'dialogue_priority',
        tracks: [],
        ducking: {
          enabled: false,
          musicGainDuringSpeechDb: -14,
          attackFrames: 0,
          releaseFrames: 0,
          regions: [],
        },
        subtitles: [
          {
            id: 'sub_primary',
            locale: 'en',
            attached: true,
            burnIn: true,
            cues: [
              {
                id: 'cue_1',
                startFrame: 0,
                endFrame: 30,
                text: 'Hello: world',
                source: 'manual',
              },
            ],
          },
        ],
        narrationTakes: [],
        ttsProvider: {
          available: false,
          status: 'blocked_xb009',
          reason: 'voice_recreation_requires_legal_review',
        },
        beatAwareEditing: { available: false, reason: 'no_reliable_beat_analyser' },
      },
      30,
      font,
    );
    expect(burned.burned).toBe(true);
    expect(burned.filter).toContain('drawtext=');
    expect(burned.filter).toContain(`text='Hello\\: world'`);
    expect(burned.filter).toContain("enable='between(t,0.0000,1.0000)'");
  });

  it('builds FilmStyleManifest grade, grain, and imageTreatment filters', async () => {
    const encode = await import('./local-encode');
    const timeless = resolveFilmStyleManifest('timeless');
    const dark = resolveFilmStyleManifest('cinematic_dark');
    const contemporary = resolveFilmStyleManifest('simple_contemporary');

    const grade = encode.buildFilmStyleGradeFilter(timeless);
    expect(grade).toContain('eq=contrast=');
    expect(grade).toContain('colorbalance=rs=');

    const grain = encode.buildFilmStyleGrainFilter(dark, 42);
    expect(grain).toContain('noise=alls=');
    expect(encode.buildFilmStyleGrainFilter({ ...contemporary, grainOpacity: 0 }, 1)).toBeNull();

    expect(encode.imageTreatmentInsetPx('editorial')).toBe(48);
    expect(encode.imageTreatmentInsetPx('spotlight')).toBe(96);
    expect(encode.imageTreatmentInsetPx('fullBleed')).toBe(0);
    const pad = encode.buildImageTreatmentPadFilter(1920, 1080, dark);
    expect(pad).toContain('pad=1920:1080');
    expect(pad).toContain(encode.cssColorToFfmpegHex(dark.mediaMatte)!);
    expect(encode.buildImageTreatmentPadFilter(1920, 1080, contemporary)).toBeNull();
  });

  it('maps FilmStyleManifest themeKey to lavfi color + themed drawtext (Remotion SafeType)', async () => {
    const encode = await import('./local-encode');
    expect(encode.cssColorToFfmpegHex('#F6F1E8')).toBe('0xF6F1E8');
    expect(encode.cssColorToFfmpegHex('#121418')).toBe('0x121418');
    expect(encode.cssColorToFfmpegHex('#abc')).toBe('0xAABBCC');
    expect(encode.cssColorToFfmpegHex('rgba(1,2,3,0.5)')).toBeNull();

    const timeless = resolveFilmStyleManifest('timeless');
    const dark = resolveFilmStyleManifest('cinematic_dark');
    expect(
      encode.buildThemeLavfiColorSource({
        cssColor: timeless.background,
        width: 1920,
        height: 1080,
        durationSeconds: 1,
      }),
    ).toBe('color=c=0xF6F1E8:s=1920x1080:d=1.000');
    expect(
      encode.buildThemeLavfiColorSource({
        cssColor: dark.background,
        width: 1920,
        height: 1080,
        durationSeconds: 2.5,
      }),
    ).toBe('color=c=0x121418:s=1920x1080:d=2.500');

    const font = '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf';
    const introLines = encode.sceneOverlaysFromTimelineScene(
      {
        id: 'intro',
        type: 'intro',
        durationFrames: 30,
        displayName: 'Theme Person',
        lifeSpanLabel: '1950–2024',
        transitionIn: 'fade',
        transitionOut: 'fade',
      },
      'en',
    );
    const timelessDraw = encode.buildDrawtextFilters(introLines, font, timeless);
    expect(timelessDraw).toContain("text='IN REMEMBRANCE'");
    expect(timelessDraw).toContain(`fontcolor=${encode.cssColorToFfmpegHex(timeless.accent)}`);
    expect(timelessDraw).toContain(`fontcolor=${encode.cssColorToFfmpegHex(timeless.ink)}`);
    expect(timelessDraw).toContain(`fontcolor=${encode.cssColorToFfmpegHex(timeless.muted)}`);
    expect(timelessDraw).toContain(`fontsize=${timeless.titleSize}`);
    expect(timelessDraw).not.toContain('fontcolor=white');

    const darkDraw = encode.buildDrawtextFilters(introLines, font, dark);
    expect(darkDraw).toContain(`fontcolor=${encode.cssColorToFfmpegHex(dark.ink)}`);
    // cinematic_dark chapterTreatment=bold bumps display title size on encode path.
    expect(darkDraw).toContain(`fontsize=${dark.titleSize + 4}`);

    const captionDraw = encode.buildDrawtextFilters(
      [{ text: 'Garden', role: 'caption' }],
      font,
      timeless,
    );
    expect(captionDraw).toContain(`fontcolor=${encode.cssColorToFfmpegHex(timeless.paper)}`);
    const darkCaption = encode.buildDrawtextFilters(
      [{ text: 'Garden', role: 'caption' }],
      font,
      dark,
    );
    expect(darkCaption).toContain(`fontcolor=${encode.cssColorToFfmpegHex(dark.ink)}`);
  });

  it('encodes cinematic_dark title cards with theme lavfi fill (QC READY)', async () => {
    const encode = await import('./local-encode');
    const detection = await encode.detectLocalEncoder();
    expect(detection.ffmpeg).toBe(true);

    const timeline = parseTimelineContract({
      schemaVersion: 1,
      fps: 30,
      width: 1920,
      height: 1080,
      seed: 7,
      locale: 'en',
      themeKey: 'cinematic_dark',
      styleManifestVersion: 1,
      watermark: false,
      displayName: 'Dark Theme Person',
      scenes: [
        {
          id: 'intro',
          type: 'intro',
          durationFrames: 45,
          displayName: 'Dark Theme Person',
          lifeSpanLabel: '1940–2020',
          transitionIn: 'fade',
          transitionOut: 'fade',
        },
        {
          id: 'chapter-1',
          type: 'chapter',
          durationFrames: 30,
          title: 'Early years',
          transitionIn: 'dissolve',
          transitionOut: 'fade',
        },
        {
          id: 'outro',
          type: 'outro',
          durationFrames: 30,
          closingLine: 'Always with us',
          transitionIn: 'fade',
          transitionOut: 'fade',
        },
      ],
    });

    const out = path.join(dataRoot, 'theme-dark.mp4');
    const result = await encode.encodeWithFfmpeg({ timeline, outputAbsolute: out });
    expect(result.ok).toBe(true);
    const probe = await encode.probeWithFfprobe(out);
    const qc = evaluateOutputQc({
      probe,
      expectedDurationSeconds: totalDurationFrames(timeline) / timeline.fps,
      requireAudio: true,
      expectedWidth: 1920,
      expectedHeight: 1080,
    });
    expect(qc.ready).toBe(true);
  }, 60_000);

  it('maps Guided/Studio transitionIn to Remotion-parity scene-arrive fade filters', async () => {
    const encode = await import('./local-encode');
    expect(encode.transitionHoldFrames('none')).toBe(0);
    expect(encode.transitionHoldFrames('fade')).toBe(10);
    expect(encode.transitionHoldFrames('dissolve')).toBe(16);
    expect(encode.buildSceneArriveFadeFilter('none', 30)).toBeNull();
    expect(encode.buildSceneArriveFadeFilter('fade', 30)).toBe('fade=t=in:st=0:d=0.3333');
    expect(encode.buildSceneArriveFadeFilter('dissolve', 30)).toBe('fade=t=in:st=0:d=0.5333');
  });

  it('maps Guided Variants crop focal/zoom to Remotion-parity cover scale filters', async () => {
    const encode = await import('./local-encode');
    const center = encode.buildSceneCoverScaleFilter(1080, 1920, undefined, 30);
    expect(center).toContain('scale=1080:1920:force_original_aspect_ratio=increase');
    expect(center).toContain("crop=1080:1920:'(iw-ow)*0.5000':'(ih-oh)*0.5000'");
    expect(center).not.toContain('pad=');

    const biased = encode.buildSceneCoverScaleFilter(
      1080,
      1920,
      { focalX: 0.15, focalY: 0.8, zoom: 1.08 },
      30,
    );
    expect(biased).toContain('scale=1166:2074:force_original_aspect_ratio=increase');
    expect(biased).toContain("crop=1080:1920:'(iw-ow)*0.1500':'(ih-oh)*0.8000'");
  });

  it('maps Remotion motion.ts Ken Burns to seeded ffmpeg zoompan (static when intensity 0)', async () => {
    const encode = await import('./local-encode');
    const seedA = encode.sceneMotionSeed(42, 'image-garden');
    const seedB = encode.sceneMotionSeed(42, 'image-garden');
    const seedC = encode.sceneMotionSeed(42, 'image-other');
    expect(seedA).toBe(seedB);
    expect(seedA).not.toBe(seedC);

    const moving = encode.buildSceneKenBurnsFilter(
      1920,
      1080,
      { focalX: 0.35, focalY: 0.6, zoom: 1.12 },
      30,
      90,
      seedA,
      0.85,
    );
    expect(moving).toContain('zoompan=z=');
    expect(moving).toContain('d=90:s=1920x1080:fps=30');
    expect(moving).toContain("crop=");
    expect(moving).not.toContain('pad=');
    // Same seed + params → identical filter (no Math.random).
    expect(
      encode.buildSceneKenBurnsFilter(
        1920,
        1080,
        { focalX: 0.35, focalY: 0.6, zoom: 1.12 },
        30,
        90,
        seedA,
        0.85,
      ),
    ).toBe(moving);

    const staticCover = encode.buildSceneKenBurnsFilter(1920, 1080, undefined, 30, 90, seedA, 0);
    expect(staticCover).not.toContain('zoompan');
    expect(staticCover).toBe(encode.buildSceneCoverScaleFilter(1920, 1080, undefined, 30));
  });

  it('maps Remotion preview watermark to ffmpeg drawtext (R-007)', async () => {
    const encode = await import('./local-encode');
    expect(encode.shouldBurnPreviewWatermark({ kind: 'preview', watermark: false })).toBe(true);
    expect(encode.shouldBurnPreviewWatermark({ kind: 'final', watermark: true })).toBe(true);
    expect(encode.shouldBurnPreviewWatermark({ kind: 'final', watermark: false })).toBe(false);
    expect(encode.shouldBurnPreviewWatermark({ watermark: false })).toBe(false);
    expect(encode.shouldBurnPreviewWatermark({ watermark: true })).toBe(true);

    const font = (await encode.resolveDrawtextFontAbsolute()) ?? '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf';
    const filter = encode.buildPreviewWatermarkDrawtextFilter(font);
    expect(filter).toContain(`text='${encode.PREVIEW_WATERMARK_TEXT}'`);
    expect(filter).toContain('fontsize=22');
    expect(filter).toContain('x=w-text_w-56');
    expect(filter).toContain('y=h-text_h-56');
    expect(filter).toContain('drawtext=');
  });

  it('burns Preview — MemorialVideo on ffmpeg when kind=preview (bytes differ from final)', async () => {
    const encode = await import('./local-encode');
    const font = await encode.resolveDrawtextFontAbsolute();
    if (!font) {
      // Host without a serif drawtext font cannot burn text overlays — skip honestly.
      return;
    }
    const { readFileSync } = await import('node:fs');

    const baseTimeline = {
      schemaVersion: 1 as const,
      fps: 30,
      width: 1920,
      height: 1080,
      seed: 7,
      locale: 'en' as const,
      themeKey: 'timeless' as const,
      styleManifestVersion: 1 as const,
      watermark: false,
      displayName: 'Watermark Person',
      scenes: [
        {
          id: 'image-1',
          type: 'image' as const,
          durationFrames: 60,
          asset: {
            assetId: 'mem_fixture_wm',
            src: path.join(cwd, 'apps/creator/public/fixtures/memory-a.png'),
          },
          caption: 'Still',
          transitionIn: 'fade' as const,
          transitionOut: 'fade' as const,
        },
      ],
    };

    const finalTimeline = parseTimelineContract({ ...baseTimeline, watermark: false });
    const previewTimeline = parseTimelineContract({ ...baseTimeline, watermark: false });
    const outFinal = path.join(dataRoot, 'wm-final.mp4');
    const outPreview = path.join(dataRoot, 'wm-preview.mp4');

    const finalResult = await encode.encodeWithFfmpeg({
      timeline: finalTimeline,
      outputAbsolute: outFinal,
      kind: 'final',
    });
    const previewResult = await encode.encodeWithFfmpeg({
      timeline: previewTimeline,
      outputAbsolute: outPreview,
      kind: 'preview',
    });
    expect(finalResult.ok).toBe(true);
    expect(previewResult.ok).toBe(true);

    const finalBytes = readFileSync(outFinal);
    const previewBytes = readFileSync(outPreview);
    expect(finalBytes.equals(previewBytes)).toBe(false);

    const probe = await encode.probeWithFfprobe(outPreview);
    const qc = evaluateOutputQc({
      probe,
      expectedDurationSeconds: totalDurationFrames(previewTimeline) / previewTimeline.fps,
      requireAudio: true,
      expectedWidth: 1920,
      expectedHeight: 1080,
    });
    expect(qc.ready).toBe(true);
  }, 60_000);

  it('honors Guided Variants crop on portrait ffmpeg READY (left vs right focal differ)', async () => {
    const encode = await import('./local-encode');
    const { spawnSync } = await import('node:child_process');
    // Horizontal gradient: left bright, right dark — cover+focal must shift mean luma.
    const gradient = path.join(dataRoot, 'focal-gradient.png');
    const painted = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=white:s=640x360',
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=640x360',
        '-filter_complex',
        '[0][1]hstack=inputs=2',
        '-frames:v',
        '1',
        gradient,
      ],
      { encoding: 'utf8' },
    );
    expect(painted.status).toBe(0);

    const encodeAtFocal = async (focalX: number, outName: string): Promise<string> => {
      const timeline = parseTimelineContract({
        schemaVersion: 1,
        fps: 30,
        width: 1080,
        height: 1920,
        seed: 44,
        locale: 'en',
        themeKey: 'timeless',
        styleManifestVersion: 1,
        watermark: false,
        displayName: 'Crop Person',
        scenes: [
          {
            id: 'image-1',
            type: 'image',
            durationFrames: 60,
            asset: { assetId: 'mem_focal', src: gradient },
            caption: '',
            crop: { focalX, focalY: 0.5, zoom: 1.08 },
            transitionIn: 'none',
            transitionOut: 'none',
          },
        ],
      });
      const out = path.join(dataRoot, outName);
      const result = await encode.encodeWithFfmpeg({ timeline, outputAbsolute: out });
      expect(result.ok).toBe(true);
      return out;
    };

    const leftOut = await encodeAtFocal(0, 'out-focal-left.mp4');
    const rightOut = await encodeAtFocal(1, 'out-focal-right.mp4');

    const meanLuma = (file: string): number => {
      const sample = spawnSync(
        'ffmpeg',
        [
          '-v',
          'error',
          '-ss',
          '0.5',
          '-i',
          file,
          '-frames:v',
          '1',
          '-f',
          'rawvideo',
          '-pix_fmt',
          'gray',
          '-s',
          '36x64',
          'pipe:1',
        ],
        { encoding: 'buffer' },
      );
      expect(sample.status).toBe(0);
      const bytes = sample.stdout as Buffer;
      expect(bytes.length).toBeGreaterThan(100);
      let sum = 0;
      for (const b of bytes) sum += b;
      return sum / bytes.length;
    };

    const leftMean = meanLuma(leftOut);
    const rightMean = meanLuma(rightOut);
    // Left-biased cover keeps the white half; right-biased keeps the black half.
    expect(leftMean).toBeGreaterThan(160);
    expect(rightMean).toBeLessThan(95);
    expect(leftMean - rightMean).toBeGreaterThan(80);

    const probe = await encode.probeWithFfprobe(leftOut);
    expect(probe.width).toBe(1080);
    expect(probe.height).toBe(1920);
  }, 60_000);

  it('applies Remotion-parity Ken Burns on image ffmpeg READY (first vs last frame differ)', async () => {
    const encode = await import('./local-encode');
    const { spawnSync } = await import('node:child_process');
    // Corner marker: white square top-left on black — pan/zoom must move it in-frame.
    const marked = path.join(dataRoot, 'ken-burns-mark.png');
    const painted = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=1280x720',
        '-f',
        'lavfi',
        '-i',
        'color=c=white:s=320x180',
        '-filter_complex',
        '[0][1]overlay=0:0',
        '-frames:v',
        '1',
        marked,
      ],
      { encoding: 'utf8' },
    );
    expect(painted.status).toBe(0);

    const timeline = parseTimelineContract({
      schemaVersion: 1,
      fps: 30,
      width: 1920,
      height: 1080,
      seed: 7,
      locale: 'en',
      themeKey: 'timeless',
      styleManifestVersion: 1,
      watermark: false,
      displayName: 'Ken Burns Person',
      scenes: [
        {
          id: 'image-garden',
          type: 'image',
          durationFrames: 90,
          asset: { assetId: 'mem_kb', src: marked },
          caption: '',
          crop: { focalX: 0.5, focalY: 0.5, zoom: 1.1 },
          transitionIn: 'none',
          transitionOut: 'none',
        },
      ],
    });
    const out = path.join(dataRoot, 'out-ken-burns.mp4');
    const result = await encode.encodeWithFfmpeg({ timeline, outputAbsolute: out });
    expect(result.ok).toBe(true);

    const sampleGray = (ss: string): Buffer => {
      const sample = spawnSync(
        'ffmpeg',
        [
          '-v',
          'error',
          '-ss',
          ss,
          '-i',
          out,
          '-frames:v',
          '1',
          '-f',
          'rawvideo',
          '-pix_fmt',
          'gray',
          '-s',
          '64x36',
          'pipe:1',
        ],
        { encoding: 'buffer' },
      );
      expect(sample.status).toBe(0);
      const bytes = sample.stdout as Buffer;
      expect(bytes.length).toBe(64 * 36);
      return bytes;
    };

    const first = sampleGray('0');
    const last = sampleGray('2.9');
    let diff = 0;
    for (let i = 0; i < first.length; i += 1) {
      diff += Math.abs(first[i]! - last[i]!);
    }
    // Static cover would be ~0; seeded Ken Burns must move the marker.
    expect(diff).toBeGreaterThan(500);

    const probe = await encode.probeWithFfprobe(out);
    expect(probe.width).toBe(1920);
    expect(probe.height).toBe(1080);
    expect(probe.hasVideo).toBe(true);
  }, 60_000);

  it('honors dissolve transitionIn on default ffmpeg READY (early frame darker than mid-scene)', async () => {
    const encode = await import('./local-encode');
    const stillPng = path.join(cwd, 'apps/creator/public/fixtures/memory-a.png');
    // Bright still after a short slate — dissolve fade-in must darken the first frames.
    const timeline = parseTimelineContract({
      schemaVersion: 1,
      fps: 30,
      width: 1920,
      height: 1080,
      seed: 21,
      locale: 'en',
      themeKey: 'timeless',
      styleManifestVersion: 1,
      watermark: false,
      displayName: 'Transition Person',
      scenes: [
        {
          id: 'intro',
          type: 'intro',
          durationFrames: 30,
          displayName: 'Transition Person',
          transitionIn: 'none',
          transitionOut: 'none',
        },
        {
          id: 'image-1',
          type: 'image',
          durationFrames: 90,
          asset: { assetId: 'mem_fixture_a', src: stillPng },
          caption: '',
          transitionIn: 'dissolve',
          transitionOut: 'none',
        },
      ],
    });

    const out = path.join(dataRoot, 'out-transition.mp4');
    const result = await encode.encodeWithFfmpeg({ timeline, outputAbsolute: out });
    expect(result.ok).toBe(true);

    const { spawnSync } = await import('node:child_process');
    const meanLumaAt = (ss: string): number => {
      // Downsample to gray raw bytes and average — no OCR / no font dependency.
      const sample = spawnSync(
        'ffmpeg',
        [
          '-v',
          'error',
          '-ss',
          ss,
          '-i',
          out,
          '-frames:v',
          '1',
          '-f',
          'rawvideo',
          '-pix_fmt',
          'gray',
          '-s',
          '64x36',
          'pipe:1',
        ],
        { encoding: 'buffer' },
      );
      expect(sample.status).toBe(0);
      const bytes = sample.stdout as Buffer;
      expect(bytes.length).toBeGreaterThan(100);
      let sum = 0;
      for (const b of bytes) sum += b;
      return sum / bytes.length;
    };

    // Image scene starts at 1.0s; dissolve hold is ~0.53s — sample ~80ms in vs mid-scene.
    const early = meanLumaAt('1.08');
    const mid = meanLumaAt('2.4');
    // Fade-from-black must leave the arrive frame substantially darker than full opacity.
    expect(early).toBeLessThan(mid * 0.55);
  }, 60_000);

  it('burns intro title + image caption into default ffmpeg READY when a font is present', async () => {
    const encode = await import('./local-encode');
    const font = await encode.resolveDrawtextFontAbsolute();
    expect(font).toBeTruthy();

    const stillPng = path.join(cwd, 'apps/creator/public/fixtures/memory-a.png');
    const timeline = parseTimelineContract({
      schemaVersion: 1,
      fps: 30,
      width: 1920,
      height: 1080,
      seed: 11,
      locale: 'en',
      themeKey: 'timeless',
      styleManifestVersion: 1,
      watermark: false,
      displayName: 'Caption Person',
      scenes: [
        {
          id: 'intro',
          type: 'intro',
          durationFrames: 30,
          displayName: 'Caption Person',
          lifeSpanLabel: '1950–2024',
          transitionIn: 'fade',
          transitionOut: 'fade',
        },
        {
          id: 'image-1',
          type: 'image',
          durationFrames: 60,
          asset: { assetId: 'mem_fixture_a', src: stillPng },
          caption: 'Family garden',
          transitionIn: 'fade',
          transitionOut: 'fade',
        },
        {
          id: 'outro',
          type: 'outro',
          durationFrames: 30,
          closingLine: 'In loving memory',
          transitionIn: 'fade',
          transitionOut: 'fade',
        },
      ],
    });

    const out = path.join(dataRoot, 'out-captions.mp4');
    const result = await encode.encodeWithFfmpeg({ timeline, outputAbsolute: out });
    expect(result.ok).toBe(true);
    const probe = await encode.probeWithFfprobe(out);
    expect(probe.hasVideo).toBe(true);
    expect(probe.hasAudio).toBe(true);
    expect((probe.durationSeconds ?? 0) > 3).toBe(true);

    // Extract mid-intro and mid-image frames; burned white text raises mean luma vs bare slate/photo edges.
    const introFrame = path.join(dataRoot, 'intro-frame.png');
    const imageFrame = path.join(dataRoot, 'image-frame.png');
    const { spawnSync } = await import('node:child_process');
    const introExtract = spawnSync(
      'ffmpeg',
      ['-y', '-ss', '0.4', '-i', out, '-frames:v', '1', introFrame],
      { encoding: 'utf8' },
    );
    expect(introExtract.status).toBe(0);
    const imageExtract = spawnSync(
      'ffmpeg',
      ['-y', '-ss', '2.0', '-i', out, '-frames:v', '1', imageFrame],
      { encoding: 'utf8' },
    );
    expect(imageExtract.status).toBe(0);

    // Sanity: frames exist and are non-trivial PNGs (drawtext path did not abort encode).
    const { statSync } = await import('node:fs');
    expect(statSync(introFrame).size).toBeGreaterThan(5_000);
    expect(statSync(imageFrame).size).toBeGreaterThan(5_000);
  }, 60_000);

  it('resolves ceremony preview srcs and encodes with catalog soundtrack (not sine)', async () => {
    process.chdir(cwd);
    const encode = await import('./local-encode');
    const previewAbs = await encode.resolveMusicSrcAbsolute('/api/music/preview?trackId=still-water');
    expect(previewAbs).toBeTruthy();
    expect(previewAbs?.endsWith('music-synthetic.wav')).toBe(true);

    const timeline = parseTimelineContract({
      schemaVersion: 1,
      fps: 30,
      width: 1920,
      height: 1080,
      seed: 2,
      locale: 'en',
      themeKey: 'timeless',
      styleManifestVersion: 1,
      watermark: false,
      displayName: 'Music Encode Person',
      music: {
        trackId: 'still-water',
        src: '/api/music/preview?trackId=still-water',
        fadeInFrames: 15,
        fadeOutFrames: 30,
      },
      audio: {
        schemaVersion: 1,
        revision: 1,
        masterProfile: 'ceremony_safe',
        tracks: [
          {
            id: 'trk_music',
            kind: 'music',
            muted: false,
            gainDb: -6,
            licensed: true,
            rights: {
              source: 'synthetic_rights_declared',
              syntheticOrRightsCleared: true,
              commercialUploadAllowed: false,
            },
            clips: [
              {
                id: 'clip_music_tribute_1',
                src: '/api/music/preview?trackId=still-water',
                startFrame: 0,
                durationFrames: 90,
                gainDb: -6,
                fadeInFrames: 15,
                fadeOutFrames: 30,
              },
            ],
          },
        ],
        ducking: {
          enabled: true,
          musicGainDuringSpeechDb: -14,
          attackFrames: 6,
          releaseFrames: 18,
          regions: [],
        },
        subtitles: [],
        narrationTakes: [],
        ttsProvider: {
          available: false,
          status: 'blocked_xb009',
          reason: 'voice_recreation_requires_legal_review',
        },
        beatAwareEditing: { available: false, reason: 'no_reliable_beat_analyser' },
      },
      scenes: [
        {
          id: 'intro',
          type: 'intro',
          durationFrames: 30,
          displayName: 'Music Encode Person',
          transitionIn: 'fade',
          transitionOut: 'fade',
        },
        {
          id: 'image-1',
          type: 'image',
          durationFrames: 60,
          asset: {
            assetId: 'mem_fixture_b',
            src: path.join(cwd, 'apps/creator/public/fixtures/memory-a.png'),
          },
          caption: 'Still',
          transitionIn: 'fade',
          transitionOut: 'fade',
        },
      ],
    });

    const resolved = await encode.resolveTimelineMusicAbsolutePath(timeline);
    expect(resolved?.source).toBe('audio_mix');
    expect(resolved?.absolute.endsWith('music-synthetic.wav')).toBe(true);

    const out = path.join(dataRoot, 'out-music.mp4');
    const result = await encode.encodeWithFfmpeg({ timeline, outputAbsolute: out });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.audioSource).toBe('timeline_music');
    }
    const probe = await encode.probeWithFfprobe(out);
    expect(probe.hasAudio).toBe(true);
    expect(probe.hasVideo).toBe(true);
  }, 60_000);

  it('applies AudioMix ducking envelope on ffmpeg READY (not flat full-volume bed)', async () => {
    process.chdir(cwd);
    const encode = await import('./local-encode');
    const { dbToLinear } = await import('@memorialvideo/domain');

    const duckChain = encode.buildDuckingAudioFilterChain(
      'amixed',
      'aout',
      {
        schemaVersion: 1,
        revision: 1,
        masterProfile: 'ceremony_safe',
        tracks: [],
        ducking: {
          enabled: true,
          musicGainDuringSpeechDb: -14,
          attackFrames: 6,
          releaseFrames: 18,
          regions: [
            {
              id: 'duck_speech_0',
              startFrame: 30,
              endFrame: 60,
              musicGainDb: -14,
              reason: 'speech',
            },
          ],
        },
        subtitles: [],
        narrationTakes: [],
        ttsProvider: {
          available: false,
          status: 'blocked_xb009',
          reason: 'voice_recreation_requires_legal_review',
        },
        beatAwareEditing: { available: false, reason: 'no_reliable_beat_analyser' },
      },
      30,
    );
    expect(duckChain.ducked).toBe(true);
    expect(duckChain.filter).toContain('volume=');
    expect(duckChain.filter).toContain(dbToLinear(-14).toFixed(6));

    const timeline = parseTimelineContract({
      schemaVersion: 1,
      fps: 30,
      width: 1920,
      height: 1080,
      seed: 3,
      locale: 'en',
      themeKey: 'timeless',
      styleManifestVersion: 1,
      watermark: false,
      displayName: 'Ducked Encode Person',
      music: {
        trackId: 'still-water',
        src: '/api/music/preview?trackId=still-water',
        fadeInFrames: 0,
        fadeOutFrames: 0,
      },
      audio: {
        schemaVersion: 1,
        revision: 1,
        masterProfile: 'ceremony_safe',
        tracks: [
          {
            id: 'trk_music',
            kind: 'music',
            muted: false,
            gainDb: 0,
            licensed: true,
            rights: {
              source: 'synthetic_rights_declared',
              syntheticOrRightsCleared: true,
              commercialUploadAllowed: false,
            },
            clips: [
              {
                id: 'clip_music_full',
                src: '/api/music/preview?trackId=still-water',
                startFrame: 0,
                durationFrames: 120,
                gainDb: 0,
                fadeInFrames: 0,
                fadeOutFrames: 0,
              },
            ],
          },
        ],
        ducking: {
          enabled: true,
          musicGainDuringSpeechDb: -14,
          attackFrames: 0,
          releaseFrames: 0,
          regions: [
            {
              id: 'duck_speech_0',
              startFrame: 30,
              endFrame: 60,
              musicGainDb: -14,
              reason: 'speech',
            },
          ],
        },
        subtitles: [],
        narrationTakes: [],
        ttsProvider: {
          available: false,
          status: 'blocked_xb009',
          reason: 'voice_recreation_requires_legal_review',
        },
        beatAwareEditing: { available: false, reason: 'no_reliable_beat_analyser' },
      },
      scenes: [
        {
          id: 'intro',
          type: 'intro',
          durationFrames: 30,
          displayName: 'Ducked Encode Person',
          transitionIn: 'fade',
          transitionOut: 'fade',
        },
        {
          id: 'image-1',
          type: 'image',
          durationFrames: 90,
          asset: {
            assetId: 'mem_fixture_c',
            src: path.join(cwd, 'apps/creator/public/fixtures/memory-a.png'),
          },
          caption: 'Still',
          transitionIn: 'fade',
          transitionOut: 'fade',
        },
      ],
    });

    const clips = await encode.resolveTimelineMusicClips(timeline);
    expect(clips).toHaveLength(1);
    expect(clips[0]?.gainDb).toBe(0);

    const out = path.join(dataRoot, 'out-ducked.mp4');
    const result = await encode.encodeWithFfmpeg({ timeline, outputAbsolute: out });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.audioSource).toBe('timeline_music_ducked');
    }
    const probe = await encode.probeWithFfprobe(out);
    expect(probe.hasAudio).toBe(true);
    expect(probe.hasVideo).toBe(true);
  }, 60_000);

  it('encodes TimelineContract video scenes (not looped stills) and muxes AudioMix speech', async () => {
    process.chdir(cwd);
    const encode = await import('./local-encode');
    const { spawnSync } = await import('node:child_process');
    const { fileURLToPath } = await import('node:url');
    const creatorRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

    const clipMp4 = path.join(dataRoot, 'short-clip.mp4');
    const made = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=0x334455:s=640x360:d=1.2',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=1.2',
        '-shortest',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        clipMp4,
      ],
      { encoding: 'utf8' },
    );
    expect(made.status).toBe(0);

    const speechWav = path.join(creatorRoot, '../video/public/fixtures/multitrack/speech.wav');
    const stillPng = path.join(creatorRoot, 'public/fixtures/memory-a.png');
    const timeline = parseTimelineContract({
      schemaVersion: 1,
      fps: 30,
      width: 1920,
      height: 1080,
      seed: 4,
      locale: 'en',
      themeKey: 'timeless',
      styleManifestVersion: 1,
      watermark: false,
      displayName: 'Video Encode Person',
      music: {
        trackId: 'still-water',
        src: '/api/music/preview?trackId=still-water',
        fadeInFrames: 0,
        fadeOutFrames: 0,
      },
      audio: {
        schemaVersion: 1,
        revision: 1,
        masterProfile: 'dialogue_priority',
        tracks: [
          {
            id: 'trk_music',
            kind: 'music',
            muted: false,
            gainDb: -6,
            licensed: true,
            rights: {
              source: 'synthetic_rights_declared',
              syntheticOrRightsCleared: true,
              commercialUploadAllowed: false,
            },
            clips: [
              {
                id: 'clip_music_full',
                src: '/api/music/preview?trackId=still-water',
                startFrame: 0,
                durationFrames: 90,
                gainDb: -6,
                fadeInFrames: 0,
                fadeOutFrames: 0,
              },
            ],
          },
          {
            id: 'trk_speech',
            kind: 'speech',
            muted: false,
            gainDb: 0,
            licensed: true,
            clips: [
              {
                id: 'clip_speech',
                src: speechWav,
                startFrame: 30,
                durationFrames: 45,
                gainDb: 0,
                fadeInFrames: 0,
                fadeOutFrames: 0,
                sourceSceneId: 'video-1',
              },
            ],
          },
        ],
        ducking: {
          enabled: true,
          musicGainDuringSpeechDb: -14,
          attackFrames: 0,
          releaseFrames: 0,
          regions: [
            {
              id: 'duck_speech_0',
              startFrame: 30,
              endFrame: 75,
              musicGainDb: -14,
              reason: 'speech',
            },
          ],
        },
        subtitles: [],
        narrationTakes: [],
        ttsProvider: {
          available: false,
          status: 'blocked_xb009',
          reason: 'voice_recreation_requires_legal_review',
        },
        beatAwareEditing: { available: false, reason: 'no_reliable_beat_analyser' },
      },
      scenes: [
        {
          id: 'intro',
          type: 'intro',
          durationFrames: 15,
          displayName: 'Video Encode Person',
          transitionIn: 'fade',
          transitionOut: 'fade',
        },
        {
          id: 'video-1',
          type: 'video',
          durationFrames: 45,
          asset: {
            assetId: 'mem_video_fixture',
            src: clipMp4,
          },
          caption: 'Clip',
          transitionIn: 'fade',
          transitionOut: 'fade',
        },
        {
          id: 'image-1',
          type: 'image',
          durationFrames: 60,
          asset: {
            assetId: 'mem_fixture_a',
            src: stillPng,
          },
          caption: 'Still',
          transitionIn: 'fade',
          transitionOut: 'fade',
        },
      ],
    });

    const dialogue = await encode.resolveTimelineDialogueClips(timeline);
    expect(dialogue).toHaveLength(1);
    expect(dialogue[0]?.kind).toBe('speech');

    const out = path.join(dataRoot, 'out-video-speech.mp4');
    const result = await encode.encodeWithFfmpeg({ timeline, outputAbsolute: out });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.audioSource).toBe('timeline_mix_ducked');
    }
    const probe = await encode.probeWithFfprobe(out);
    expect(probe.hasAudio).toBe(true);
    expect(probe.hasVideo).toBe(true);
    expect((probe.durationSeconds ?? 0) > 2).toBe(true);
  }, 90_000);

  it('advances a final render to READY when local encoder is enabled', async () => {
    // Point CREATOR_ROOT fixtures via chdir under workspace temporarily for absolute fixture resolve.
    process.chdir(cwd);
    const store = await import('./store');
    const render = await import('./render');
    const created = await store.createTribute({ displayName: 'Ready Person' });
    for (let i = 0; i < store.FIRST_FILM_READY_PHOTO_THRESHOLD; i += 1) {
      await store.addMemory(created.publicId, {
        title: `M${i}`,
        filename: `m${i}.jpg`,
        alreadyReady: true,
        imagePath: '/fixtures/memory-a.png',
      });
    }
    for (let i = 0; i < 6; i += 1) {
      const step = await store.advanceFirstFilm(created.publicId);
      if (step.ok && step.stage === 'ready_to_review') break;
    }
    await store.fulfillLocalMemorialPack(created.publicId);
    const enqueued = await render.enqueueRenderJob(created.publicId, 'final');
    expect(enqueued.ok).toBe(true);
    if (!enqueued.ok) return;

    let status = enqueued.job.status;
    let note = '';
    for (let i = 0; i < 8 && status !== 'FAILED_RETRYABLE' && status !== 'READY'; i += 1) {
      const step = await render.advanceRenderOnce(created.publicId);
      status = step.advanced?.status ?? status;
      note = step.note;
    }
    expect(status).toBe('READY');
    expect(note).toContain('ready_after_qc');
    const reloaded = await store.getTribute(created.publicId);
    const download = render.planDownloadFromJobs(reloaded);
    expect(download.canDownloadMp4).toBe(true);
    expect(download.hasPoster).toBe(true);
    const absolute = await render.resolveReadyFinalAbsolutePath(reloaded!);
    expect(absolute?.endsWith('.mp4')).toBe(true);
    const readyJob = reloaded!.renderJobs.find((j) => j.status === 'READY');
    expect(readyJob?.posterPath?.endsWith('.poster.jpg')).toBe(true);
    const posterAbsolute = await render.resolveReadyFinalPosterAbsolutePath(reloaded!);
    expect(posterAbsolute?.endsWith('.poster.jpg')).toBe(true);
    const summary = await store.listTributeSummaries();
    const row = summary.find((t) => t.publicId === created.publicId);
    expect(row?.hasPoster).toBe(true);
    expect(row?.readyJobId).toBe(readyJob?.id);
  }, 120_000);

  it('publishes AudioMix music/narration/speech clip bytes into Remotion bundle public/', async () => {
    process.chdir(cwd);
    const encode = await import('./local-encode');
    const { accessSync, mkdtempSync: mkdtemp, mkdirSync, rmSync: rm } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const videoPublic = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../video/public',
    );
    const musicWav = path.join(videoPublic, 'fixtures/multitrack/music-synthetic.wav');
    const narrationWav = path.join(videoPublic, 'fixtures/multitrack/narration.wav');
    const speechWav = path.join(videoPublic, 'fixtures/multitrack/speech.wav');
    accessSync(musicWav);
    accessSync(narrationWav);
    accessSync(speechWav);

    const serveUrl = mkdtemp(path.join(tmpdir(), 'mv-rem-bundle-'));
    mkdirSync(path.join(serveUrl, 'public'), { recursive: true });
    try {
      const mix = {
        schemaVersion: 1 as const,
        revision: 1,
        masterProfile: 'ceremony_safe' as const,
        tracks: [
          {
            id: 'trk_music',
            kind: 'music' as const,
            muted: false,
            gainDb: -6,
            licensed: true,
            rights: {
              source: 'synthetic_rights_declared' as const,
              syntheticOrRightsCleared: true,
              commercialUploadAllowed: false,
            },
            clips: [
              {
                id: 'clip_music',
                src: '/api/music/preview?trackId=still-water',
                startFrame: 0,
                durationFrames: 90,
                gainDb: -6,
                fadeInFrames: 0,
                fadeOutFrames: 0,
              },
            ],
          },
          {
            id: 'trk_narration',
            kind: 'narration' as const,
            muted: false,
            gainDb: 0,
            licensed: true,
            clips: [
              {
                id: 'clip_narration',
                src: narrationWav,
                startFrame: 15,
                durationFrames: 45,
                gainDb: 0,
                fadeInFrames: 0,
                fadeOutFrames: 0,
              },
            ],
          },
          {
            id: 'trk_speech',
            kind: 'speech' as const,
            muted: false,
            gainDb: 0,
            licensed: true,
            clips: [
              {
                id: 'clip_speech',
                src: speechWav,
                startFrame: 30,
                durationFrames: 30,
                gainDb: 0,
                fadeInFrames: 0,
                fadeOutFrames: 0,
                sourceSceneId: 'video-1',
              },
            ],
          },
        ],
        ducking: {
          enabled: true,
          musicGainDuringSpeechDb: -14,
          attackFrames: 6,
          releaseFrames: 18,
          regions: [],
        },
        subtitles: [],
        narrationTakes: [
          {
            id: 'take_1',
            src: narrationWav,
            durationFrames: 45,
            approved: true,
            selected: true,
            ttsStatus: 'unavailable' as const,
          },
        ],
        ttsProvider: {
          available: false as const,
          status: 'blocked_xb009' as const,
          reason: 'voice_recreation_requires_legal_review',
        },
        beatAwareEditing: { available: false as const, reason: 'no_reliable_beat_analyser' },
      };

      const rewritten = await encode.publishAudioMixToBundle({
        serveUrl,
        mix,
        trackIdHint: 'still-water',
      });

      const musicRel = 'creator-assets/mix/trk_music/clip_music.wav';
      const narrationRel = 'creator-assets/mix/trk_narration/clip_narration.wav';
      const speechRel = 'creator-assets/mix/trk_speech/clip_speech.wav';
      const takeRel = 'creator-assets/mix/narration-takes/take_1.wav';

      expect(rewritten.tracks[0]?.clips[0]?.src).toBe(musicRel);
      expect(rewritten.tracks[1]?.clips[0]?.src).toBe(narrationRel);
      expect(rewritten.tracks[2]?.clips[0]?.src).toBe(speechRel);
      expect(rewritten.narrationTakes[0]?.src).toBe(takeRel);

      accessSync(path.join(serveUrl, 'public', musicRel));
      accessSync(path.join(serveUrl, 'public', narrationRel));
      accessSync(path.join(serveUrl, 'public', speechRel));
      accessSync(path.join(serveUrl, 'public', takeRel));
    } finally {
      rm(serveUrl, { recursive: true, force: true });
    }
  });
});
