import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { THEME_KEYS, totalDurationFrames, type ThemeKey } from '@memorialvideo/contracts';
import { evaluateOutputQc } from '@memorialvideo/domain';

import { publishGeneratedAssetToBundle } from '../src/bundle-public';
import {
  createFullSpikeTimeline,
  createGoldenTimeline,
  createThemeGoldenTimeline,
} from '../src/timelines';
import { assertDuration, probeOutput } from '../src/qc';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.resolve(root, '../../artifacts/renders');

function kindFromArgs(): 'golden' | 'full' {
  const flag = process.argv.find((arg) => arg.startsWith('--kind='));
  return flag === '--kind=full' ? 'full' : 'golden';
}

function themeFromArgs(): ThemeKey | undefined {
  const flag = process.argv.find((arg) => arg.startsWith('--theme='));
  if (!flag) {
    return undefined;
  }
  const value = flag.slice('--theme='.length) as ThemeKey;
  if (!(THEME_KEYS as readonly string[]).includes(value)) {
    throw new Error(`unknown theme ${value}; expected one of ${THEME_KEYS.join(', ')}`);
  }
  return value;
}

async function main(): Promise<void> {
  const kind = kindFromArgs();
  const themeKey = themeFromArgs();
  const watermark = kind === 'golden';
  const timeline =
    kind === 'full'
      ? createFullSpikeTimeline(false)
      : themeKey
        ? createThemeGoldenTimeline(themeKey, watermark)
        : createGoldenTimeline(watermark);
  const compositionId = kind === 'full' ? 'MemorialFull' : 'MemorialGolden';
  const output =
    kind === 'golden' && themeKey
      ? path.join(artifacts, `golden-${themeKey}.mp4`)
      : path.join(artifacts, `${kind}-${watermark ? 'preview' : 'final'}.mp4`);

  await mkdir(artifacts, { recursive: true });

  const serveUrl = await bundle({
    entryPoint: path.join(root, 'src/index.ts'),
    onProgress: () => undefined,
  });

  if (kind === 'full') {
    const clipPath = path.join(root, 'public/fixtures/generated/clip-phone.mp4');
    const clipComposition = await selectComposition({
      serveUrl,
      id: 'PhoneClip',
    });
    await renderMedia({
      composition: clipComposition,
      serveUrl,
      codec: 'h264',
      audioCodec: 'aac',
      outputLocation: clipPath,
    });
    await publishGeneratedAssetToBundle(serveUrl, clipPath, 'fixtures/generated/clip-phone.mp4');
  }

  const composition = await selectComposition({
    serveUrl,
    id: compositionId,
    inputProps: timeline,
  });

  const started = Date.now();
  const memoryBefore = process.memoryUsage();
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    audioCodec: 'aac',
    outputLocation: output,
    inputProps: timeline,
    concurrency: 1,
    timeoutInMilliseconds: 120_000,
    chromiumOptions: {
      enableMultiProcessOnLinux: false,
      gl: 'angle',
    },
    onProgress: ({ progress }) => {
      const percent = Math.round(progress * 100);
      if (percent === 0 || percent === 100 || percent % 10 === 0) {
        const key = `logged-${percent}`;
        if (!(globalThis as { __mvRenderLog?: Set<string> }).__mvRenderLog) {
          (globalThis as { __mvRenderLog?: Set<string> }).__mvRenderLog = new Set();
        }
        const seen = (globalThis as { __mvRenderLog?: Set<string> }).__mvRenderLog!;
        if (!seen.has(key)) {
          seen.add(key);
          process.stdout.write(`render-progress ${percent}%\n`);
        }
      }
    },
  });

  const probe = await probeOutput(output, {
    width: timeline.width,
    height: timeline.height,
  });
  const expectedSeconds = totalDurationFrames(timeline) / timeline.fps;
  const durationFailures = assertDuration(probe.durationInSeconds, expectedSeconds);
  const info = await stat(output);
  const qc = evaluateOutputQc({
    expectedDurationSeconds: expectedSeconds,
    requireAudio: true,
    expectedWidth: timeline.width,
    expectedHeight: timeline.height,
    probe: {
      exists: info.isFile(),
      sizeBytes: info.size,
      width: probe.width,
      height: probe.height,
      durationSeconds: probe.durationInSeconds,
      hasVideo: Boolean(probe.width),
      hasAudio: probe.hasAudio,
      container: probe.container,
    },
  });
  const elapsedMs = Date.now() - started;

  const memoryAfter = process.memoryUsage();
  const report = {
    kind,
    themeKey: timeline.themeKey,
    output,
    elapsedMs,
    expectedFrames: totalDurationFrames(timeline),
    expectedSeconds,
    sceneCount: timeline.scenes.length,
    imageCount: timeline.scenes.filter((scene) => scene.type === 'image').length,
    hasVideoScene: timeline.scenes.some((scene) => scene.type === 'video'),
    watermark: timeline.watermark,
    probe,
    qc,
    durationFailures,
    memory: {
      rssBeforeMb: Math.round(memoryBefore.rss / 1024 / 1024),
      rssAfterMb: Math.round(memoryAfter.rss / 1024 / 1024),
      heapUsedAfterMb: Math.round(memoryAfter.heapUsed / 1024 / 1024),
    },
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!probe.ok || durationFailures.length > 0 || !qc.ready) {
    process.exitCode = 1;
  }
}

await main();
