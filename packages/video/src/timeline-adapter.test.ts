import { parseTimelineContract, totalDurationFrames } from '@memorialvideo/contracts';
import { describe, expect, it } from 'vitest';

import { createFullSpikeTimeline, createGoldenTimeline } from './timelines';

describe('spike timelines', () => {
  it('creates a deterministic golden preview and final pair', () => {
    const preview = createGoldenTimeline(true);
    const final = createGoldenTimeline(false);
    expect(preview.watermark).toBe(true);
    expect(final.watermark).toBe(false);
    expect(totalDurationFrames(preview)).toBe(totalDurationFrames(final));
    expect(preview.scenes.map((scene) => scene.id)).toEqual(final.scenes.map((scene) => scene.id));
    expect(preview.displayName).toContain('Żurawska');
  });

  it('builds a 100-image representative timeline', () => {
    const timeline = createFullSpikeTimeline(false);
    const images = timeline.scenes.filter((scene) => scene.type === 'image');
    expect(images).toHaveLength(100);
    const video = timeline.scenes.find((scene) => scene.type === 'video');
    expect(video?.type === 'video' && video.asset.src).toBe('fixtures/generated/clip-phone.mp4');
    expect(() => parseTimelineContract(timeline)).not.toThrow();
  });

  it('rejects a timeline that points at no scenes', () => {
    expect(() =>
      parseTimelineContract({
        ...createGoldenTimeline(true),
        scenes: [],
      }),
    ).toThrow();
  });
});
