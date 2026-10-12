import { parseMedia } from '@remotion/media-parser';
import { nodeReader } from '@remotion/media-parser/node';

export type MediaQcResult = {
  ok: boolean;
  failures: string[];
  width?: number;
  height?: number;
  durationInSeconds?: number;
  hasAudio?: boolean;
  container?: string;
  videoCodec?: string;
  audioCodec?: string;
};

const DURATION_TOLERANCE_SECONDS = 0.35;

export async function probeOutput(
  src: string,
  expected?: { width?: number; height?: number },
): Promise<MediaQcResult> {
  const failures: string[] = [];
  const expectedWidth = expected?.width ?? 1920;
  const expectedHeight = expected?.height ?? 1080;

  try {
    const parsed = await parseMedia({
      src,
      reader: nodeReader,
      acknowledgeRemotionLicense: true,
      fields: {
        durationInSeconds: true,
        dimensions: true,
        audioCodec: true,
        videoCodec: true,
        container: true,
      },
    });

    const width = parsed.dimensions?.width;
    const height = parsed.dimensions?.height;
    const result: MediaQcResult = {
      ok: true,
      failures,
      width,
      height,
      durationInSeconds: parsed.durationInSeconds ?? undefined,
      hasAudio: Boolean(parsed.audioCodec),
      container: parsed.container ?? undefined,
      videoCodec: parsed.videoCodec ?? undefined,
      audioCodec: parsed.audioCodec ?? undefined,
    };

    if (width !== expectedWidth || height !== expectedHeight) {
      failures.push(`resolution ${width}x${height} is not ${expectedWidth}x${expectedHeight}`);
    }
    if (parsed.container && parsed.container !== 'mp4') {
      failures.push(`container ${parsed.container} is not mp4`);
    }
    if (!parsed.videoCodec) {
      failures.push('video codec is missing');
    }

    result.ok = failures.length === 0;
    return result;
  } catch (error) {
    return {
      ok: false,
      failures: [error instanceof Error ? error.message : 'unreadable media'],
    };
  }
}

export function assertDuration(actualSeconds: number | undefined, expectedSeconds: number): string[] {
  if (actualSeconds === undefined) {
    return ['duration is missing'];
  }
  if (Math.abs(actualSeconds - expectedSeconds) > DURATION_TOLERANCE_SECONDS) {
    return [`duration ${actualSeconds}s is outside ${expectedSeconds}s ± ${DURATION_TOLERANCE_SECONDS}`];
  }
  return [];
}
