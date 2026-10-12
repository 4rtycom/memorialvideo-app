import { describe, expect, it } from 'vitest';

import {
  IMAGE_MAX_FRAMES,
  formatTimelineClock,
  parseTimelineContract,
  sceneIdAtFrame,
  dimensionsForAspect,
  sceneStartFrame,
  sceneStartFrames,
  secondsToFrames,
  totalDurationFrames,
} from './timeline';

const validTimeline = {
  schemaVersion: 1,
  fps: 30,
  width: 1920,
  height: 1080,
  seed: 7,
  locale: 'nl',
  themeKey: 'timeless',
  watermark: true,
  displayName: 'Anna Żółć-Müller',
  scenes: [
    {
      id: 'intro',
      type: 'intro',
      durationFrames: 90,
      displayName: 'Anna Żółć-Müller',
      lifeSpanLabel: '1948–2026',
      transitionIn: 'fade',
      transitionOut: 'fade',
    },
    {
      id: 'chapter-1',
      type: 'chapter',
      durationFrames: 75,
      title: 'Frühe Jahre',
      transitionIn: 'fade',
      transitionOut: 'dissolve',
    },
    {
      id: 'image-1',
      type: 'image',
      durationFrames: 120,
      asset: { assetId: 'a1', src: 'fixtures/generated/image-001.png' },
      caption: 'Praia de São Paulo',
      transitionIn: 'dissolve',
      transitionOut: 'fade',
    },
    {
      id: 'quote-1',
      type: 'quote',
      durationFrames: 90,
      text: 'La vie est faite de souvenirs partagés.',
      attribution: 'Famille',
      transitionIn: 'fade',
      transitionOut: 'fade',
    },
    {
      id: 'outro',
      type: 'outro',
      durationFrames: 90,
      closingLine: 'Always remembered.',
      transitionIn: 'fade',
      transitionOut: 'none',
    },
  ],
};

describe('timeline contract', () => {
  it('parses a representative multilingual timeline', () => {
    const timeline = parseTimelineContract(validTimeline);
    expect(totalDurationFrames(timeline)).toBe(465);
    expect(sceneStartFrames(timeline)).toEqual([0, 90, 165, 285, 375]);
  });

  it('rejects duplicate scene ids', () => {
    expect(() =>
      parseTimelineContract({
        ...validTimeline,
        scenes: [validTimeline.scenes[0], validTimeline.scenes[0]],
      }),
    ).toThrow();
  });

  it('rejects image scenes outside the safe duration window', () => {
    expect(() =>
      parseTimelineContract({
        ...validTimeline,
        scenes: [
          {
            ...validTimeline.scenes[2],
            durationFrames: IMAGE_MAX_FRAMES + 1,
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects missing assets on image scenes', () => {
    expect(() =>
      parseTimelineContract({
        ...validTimeline,
        scenes: [
          {
            id: 'broken',
            type: 'image',
            durationFrames: 120,
            transitionIn: 'fade',
            transitionOut: 'fade',
          },
        ],
      }),
    ).toThrow();
  });

  it('converts seconds to integer frames', () => {
    expect(secondsToFrames(3)).toBe(90);
    expect(secondsToFrames(1.5)).toBe(45);
  });

  it('rejects negative durations', () => {
    expect(() => secondsToFrames(-1)).toThrow();
  });

  it('seeks a scene by id and formats a calm clock', () => {
    const timeline = parseTimelineContract(validTimeline);
    expect(sceneStartFrame(timeline, 'image-1')).toBe(165);
    expect(sceneIdAtFrame(timeline, 165)).toBe('image-1');
    expect(sceneIdAtFrame(timeline, 0)).toBe(timeline.scenes[0]?.id);
    expect(formatTimelineClock(totalDurationFrames(timeline), timeline.fps)).toBe('0:15');
  });

  it('maps output aspects to 1080-class frames', () => {
    expect(dimensionsForAspect('16:9')).toEqual({ width: 1920, height: 1080 });
    expect(dimensionsForAspect('9:16')).toEqual({ width: 1080, height: 1920 });
    expect(dimensionsForAspect('1:1')).toEqual({ width: 1080, height: 1080 });
  });
});
