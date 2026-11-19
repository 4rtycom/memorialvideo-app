import { describe, expect, it } from 'vitest';
import { ceremonyButtonEmphasis } from './ceremony-emphasis';

describe('ceremonyButtonEmphasis', () => {
  it('highlights Pause while the film is playing', () => {
    expect(ceremonyButtonEmphasis({ playing: true, holdActive: false })).toEqual({
      pause: 'primary',
      resume: 'secondary',
    });
  });

  it('highlights Resume when paused', () => {
    expect(ceremonyButtonEmphasis({ playing: false, holdActive: false })).toEqual({
      pause: 'secondary',
      resume: 'primary',
    });
  });

  it('highlights Resume while holding for live words', () => {
    expect(ceremonyButtonEmphasis({ playing: false, holdActive: true }).resume).toBe('primary');
    expect(ceremonyButtonEmphasis({ playing: true, holdActive: true }).resume).toBe('primary');
  });
});
