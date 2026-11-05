import { describe, expect, it } from 'vitest';

import {
  buildCeremonyRunningOrder,
  nextAutoPauseFrame,
  resolveSpeechPauseFrame,
} from './ceremony-player';
import { buildInitialTimeline } from './sequence';

describe('ceremony player cues', () => {
  const timeline = buildInitialTimeline({
    displayName: 'River',
    locale: 'en',
    themeKey: 'timeless',
    chapters: ['Early years', 'Later years'],
    assets: [
      { id: 'a1', type: 'image', src: 'blob:1', capturedAt: null },
      { id: 'a2', type: 'image', src: 'blob:2', capturedAt: null },
    ],
  });

  it('resolves speech pauses after Opening / Memories / Farewell moments', () => {
    const beforeOpening = resolveSpeechPauseFrame(timeline, null);
    const afterOpening = resolveSpeechPauseFrame(timeline, 'opening');
    const afterMemories = resolveSpeechPauseFrame(timeline, 'memories');
    const afterFarewell = resolveSpeechPauseFrame(timeline, 'farewell');

    expect(beforeOpening).toBe(0);
    expect(afterOpening).toBeGreaterThan(0);
    expect(afterMemories).toBeGreaterThan(afterOpening);
    expect(afterFarewell).toBeGreaterThanOrEqual(afterMemories);
  });

  it('builds a running order with chapters and auto-pause speech cues', () => {
    const order = buildCeremonyRunningOrder({
      timeline,
      speechPauses: [
        {
          id: 'pause_memories',
          afterSlot: 'memories',
          label: 'Family tribute',
          waitingNote: 'Resume when ready',
          enabled: true,
        },
        {
          id: 'pause_disabled',
          afterSlot: 'opening',
          label: 'Skipped',
          waitingNote: '',
          enabled: false,
        },
      ],
    });

    expect(order.some((item) => item.kind === 'chapter' && item.title === 'Early years')).toBe(true);
    const speech = order.find((item) => item.id === 'pause_memories');
    expect(speech?.autoPause).toBe(true);
    expect(speech?.title).toBe('Family tribute');
    expect(order.some((item) => item.id === 'pause_disabled')).toBe(false);

    const afterFirst = nextAutoPauseFrame(order, -1);
    expect(afterFirst).toBe(speech?.startFrame);
    expect(nextAutoPauseFrame(order, speech!.startFrame)).toBeNull();
  });
});
