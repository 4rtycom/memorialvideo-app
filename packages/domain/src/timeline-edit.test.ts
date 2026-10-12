import { describe, expect, it } from 'vitest';

import { buildInitialTimeline } from './sequence';
import { applyCaption, applyCrop, applyDuration, pushTimelineEdit, undoTimeline } from './timeline-edit';

describe('timeline edits', () => {
  const base = buildInitialTimeline({
    displayName: 'Alex Rivera',
    locale: 'en',
    themeKey: 'warm_light',
    assets: [{ id: 'a', type: 'image', src: 'asset://a', capturedAt: null }],
  });

  it('clamps image duration and stores a crop', () => {
    const image = base.scenes.find((scene) => scene.type === 'image');
    expect(image).toBeTruthy();
    if (image?.type !== 'image') {
      return;
    }
    expect(applyDuration(image, 12).durationFrames).toBe(60);
    const cropped = applyCrop(image, { focalX: 0.2, focalY: 0.8, zoom: 1.2 });
    const captioned = applyCaption(image, '  A garden in June  ');
    expect(cropped.type === 'image' ? cropped.crop?.focalX : undefined).toBe(0.2);
    expect(captioned.type === 'image' ? captioned.caption : undefined).toBe('A garden in June');
  });

  it('undoes the last edit', () => {
    const next = { ...base, seed: 9 };
    const undone = undoTimeline(pushTimelineEdit({ past: [], present: base, future: [] }, next));
    expect(undone.present.seed).toBe(base.seed);
  });
});
