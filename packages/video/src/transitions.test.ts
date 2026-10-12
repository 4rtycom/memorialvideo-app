import { describe, expect, it } from 'vitest';

import { transitionHoldFrames, transitionOpacity } from './transitions';

describe('scene transitions', () => {
  it('cuts immediately and fades in over a short hold', () => {
    expect(transitionHoldFrames('none')).toBe(0);
    expect(transitionOpacity(0, 'none')).toBe(1);
    expect(transitionOpacity(0, 'fade')).toBe(0);
    expect(transitionOpacity(5, 'fade')).toBe(0.5);
    expect(transitionOpacity(16, 'dissolve')).toBe(1);
  });
});
