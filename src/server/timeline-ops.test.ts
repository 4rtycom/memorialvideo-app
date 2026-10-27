import { describe, expect, it } from 'vitest';
import { parseTimelineContract } from '@memorialvideo/contracts';
import { applyTimelineOp } from './timeline-ops';
import { buildTimelineFromTribute } from './timeline';

function sampleTimeline() {
  const timeline = buildTimelineFromTribute({
    publicId: 'mv_abcdef0123456789',
    displayName: 'Ada',
    bornLabel: '1815',
    rememberedLabel: '1852',
    themeKey: 'timeless',
    entitlement: null,
    memories: [
      {
        id: 'mem_aaaaaaaaaaaaaaaa',
        title: 'One',
        imagePath: '/fixtures/memory-a.png',
        ingestStatus: 'READY',
      },
      {
        id: 'mem_bbbbbbbbbbbbbbbb',
        title: 'Two',
        imagePath: '/fixtures/memory-b.png',
        ingestStatus: 'READY',
      },
    ],
  });
  return parseTimelineContract(timeline);
}

describe('timeline ops', () => {
  it('updates caption/duration/aspect on the shared contract', () => {
    const base = sampleTimeline();
    const image = base.scenes.find((s) => s.type === 'image');
    expect(image).toBeTruthy();
    if (!image || image.type !== 'image') return;

    const captioned = applyTimelineOp(base, {
      op: 'set_caption',
      sceneId: image.id,
      caption: 'Notes on the engine',
    });
    const captionScene = captioned.scenes.find((s) => s.id === image.id);
    expect(captionScene?.type === 'image' && captionScene.caption).toBe('Notes on the engine');

    const longer = applyTimelineOp(captioned, {
      op: 'set_duration',
      sceneId: image.id,
      durationFrames: 180,
    });
    const longerScene = longer.scenes.find((s) => s.id === image.id);
    expect(longerScene?.durationFrames).toBe(180);

    const portrait = applyTimelineOp(longer, { op: 'set_aspect', aspect: '9:16' });
    expect(portrait.width).toBe(1080);
    expect(portrait.height).toBe(1920);
  });

  it('swaps two story moments and leaves the intro in place', () => {
    const base = sampleTimeline();
    const images = base.scenes.filter((scene) => scene.type === 'image');
    expect(images.length).toBeGreaterThan(1);
    const first = images[0]!;
    const second = images[1]!;
    const toIndex = base.scenes.findIndex((scene) => scene.id === first.id);
    const moved = applyTimelineOp(base, { op: 'move_scene', sceneId: second.id, toIndex });
    const media = moved.scenes.filter((scene) => scene.type === 'image').map((scene) => scene.id);
    expect(media[0]).toBe(second.id);
    expect(media[1]).toBe(first.id);
    expect(moved.scenes[0]?.type).toBe('intro');
  });
});
