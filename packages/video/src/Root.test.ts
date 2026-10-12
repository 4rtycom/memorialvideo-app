import { totalDurationFrames } from '@memorialvideo/contracts';
import { describe, expect, it } from 'vitest';

import { createGoldenTimeline } from './timelines';

describe('composition metadata', () => {
  it('keeps preview and final on the same frame count', () => {
    const preview = totalDurationFrames(createGoldenTimeline(true));
    const final = totalDurationFrames(createGoldenTimeline(false));
    expect(preview).toBe(final);
    expect(preview).toBeGreaterThan(300);
  });
});
