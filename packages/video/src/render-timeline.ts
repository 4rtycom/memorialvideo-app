import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import type { TimelineContract } from '@memorialvideo/contracts';

export async function bundleVideoEntry(entryPoint: string): Promise<string> {
  return bundle({
    entryPoint,
    onProgress: () => undefined,
  });
}

export async function renderTimelineToFile(input: {
  entryPoint: string;
  timeline: TimelineContract;
  kind: 'preview' | 'final' | 'fallback';
  output: string;
  /** Reuse a prior Remotion bundle (e.g. multi-theme golden gate). */
  serveUrl?: string;
  onProgressPercent?: (percent: number) => void;
}): Promise<string> {
  await mkdir(path.dirname(input.output), { recursive: true });
  const serveUrl = input.serveUrl ?? (await bundleVideoEntry(input.entryPoint));
  const composition = await selectComposition({
    serveUrl,
    id: input.kind === 'preview' ? 'MemorialGolden' : 'MemorialFull',
    inputProps: input.timeline,
  });
  const logged = new Set<number>();
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    audioCodec: 'aac',
    outputLocation: input.output,
    inputProps: input.timeline,
    concurrency: 1,
    timeoutInMilliseconds: 120_000,
    chromiumOptions: {
      enableMultiProcessOnLinux: false,
      gl: 'angle',
    },
    onProgress: ({ progress }) => {
      if (!input.onProgressPercent) {
        return;
      }
      const percent = Math.round(progress * 100);
      if (percent === 0 || percent === 100 || percent % 10 === 0) {
        if (!logged.has(percent)) {
          logged.add(percent);
          input.onProgressPercent(percent);
        }
      }
    },
  });
  return input.output;
}
