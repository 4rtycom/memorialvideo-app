export const OUTPUT_DURATION_TOLERANCE_SECONDS = 0.35;

export type OutputProbe = {
  exists: boolean;
  sizeBytes: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  hasVideo?: boolean;
  hasAudio?: boolean;
  container?: string;
};

export type OutputQcResult = {
  ok: boolean;
  ready: boolean;
  failures: string[];
};

export function evaluateOutputQc(input: {
  probe: OutputProbe;
  expectedDurationSeconds: number;
  requireAudio: boolean;
  expectedWidth?: number;
  expectedHeight?: number;
}): OutputQcResult {
  const failures: string[] = [];
  const expectedWidth = input.expectedWidth ?? 1920;
  const expectedHeight = input.expectedHeight ?? 1080;
  if (!input.probe.exists || input.probe.sizeBytes <= 0) {
    failures.push('missing_file');
  }
  if (input.probe.width !== expectedWidth || input.probe.height !== expectedHeight) {
    failures.push('resolution');
  }
  if (input.probe.hasVideo === false) {
    failures.push('video_missing');
  }
  if (input.requireAudio && !input.probe.hasAudio) {
    failures.push('audio_missing');
  }
  if (input.probe.container && input.probe.container !== 'mp4') {
    failures.push('container');
  }
  if (input.probe.durationSeconds === undefined) {
    failures.push('duration_missing');
  } else if (
    Math.abs(input.probe.durationSeconds - input.expectedDurationSeconds) > OUTPUT_DURATION_TOLERANCE_SECONDS
  ) {
    failures.push('duration');
  }
  return {
    ok: failures.length === 0,
    ready: failures.length === 0,
    failures,
  };
}
