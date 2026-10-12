import { describe, expect, it } from 'vitest';

import {
  applyDirectorOperations,
  hashTimeline,
  invertDirectorOperations,
  proposeOutputVariant,
  timelineAspect,
  withAspect,
} from './index';
import { buildInitialTimeline } from './sequence';

function sampleTimeline(aspect: '16:9' | '9:16' | '1:1' = '16:9') {
  return buildInitialTimeline({
    displayName: 'Variant Tribute',
    locale: 'en',
    themeKey: 'timeless',
    aspect,
    assets: [
      {
        id: 'img_a',
        type: 'image',
        src: 'storage://projects/p/assets/img_a/original',
        capturedAt: '2020-01-01',
        focalX: 0.35,
        focalY: 0.4,
        zoom: 1,
      },
      {
        id: 'img_b',
        type: 'image',
        src: 'storage://projects/p/assets/img_b/original',
        capturedAt: '2021-01-01',
        focalX: 0.6,
        focalY: 0.55,
        zoom: 1.2,
      },
    ],
    seed: 7,
  });
}

describe('output variant inheritance', () => {
  it('proposes vertical aspect with inherited crops on one timeline', () => {
    const before = sampleTimeline('16:9');
    expect(timelineAspect(before)).toBe('16:9');
    const proposal = proposeOutputVariant({
      timeline: before,
      kind: 'vertical',
      baseTimelineHash: hashTimeline(before),
    });
    expect(proposal.afterAspect).toBe('9:16');
    expect(proposal.afterTimeline.width).toBe(1080);
    expect(proposal.afterTimeline.height).toBe(1920);
    expect(proposal.cropUpdates).toBeGreaterThan(0);
    expect(proposal.afterTimeline.scenes).toHaveLength(before.scenes.length);
    const image = proposal.afterTimeline.scenes.find((scene) => scene.type === 'image' && scene.id.includes('img_a'));
    expect(image && image.type === 'image' ? image.crop?.focalX : null).toBe(0.35);
    expect(image && image.type === 'image' ? image.crop?.zoom : null).toBeGreaterThanOrEqual(1.08);
  });

  it('applies and reverts set_aspect without forking scenes', () => {
    const before = sampleTimeline('16:9');
    const proposal = proposeOutputVariant({
      timeline: before,
      kind: 'square',
      baseTimelineHash: hashTimeline(before),
    });
    const applied = applyDirectorOperations(before, proposal.operations);
    expect(applied.width).toBe(1080);
    expect(applied.height).toBe(1080);
    const inverse = invertDirectorOperations(before, proposal.operations);
    const restored = applyDirectorOperations(applied, inverse);
    expect(restored.width).toBe(1920);
    expect(restored.height).toBe(1080);
    expect(restored.scenes.map((scene) => scene.id)).toEqual(before.scenes.map((scene) => scene.id));
  });

  it('scales ceremony_short under duration cap', () => {
    const before = sampleTimeline('16:9');
    const long = {
      ...before,
      scenes: before.scenes.map((scene) =>
        scene.type === 'image' ? { ...scene, durationFrames: 240 } : scene,
      ),
    };
    const proposal = proposeOutputVariant({
      timeline: long,
      kind: 'ceremony_short',
      durationCapFrames: 300,
      baseTimelineHash: hashTimeline(long),
    });
    expect(proposal.durationScaled).toBe(true);
    expect(
      proposal.afterTimeline.scenes.reduce((sum, scene) => sum + scene.durationFrames, 0),
    ).toBeLessThanOrEqual(320);
  });

  it('withAspect keeps scene identity', () => {
    const before = sampleTimeline('16:9');
    const vertical = withAspect(before, '9:16');
    expect(vertical.scenes.map((scene) => scene.id)).toEqual(before.scenes.map((scene) => scene.id));
    expect(vertical.displayName).toBe(before.displayName);
  });
});
