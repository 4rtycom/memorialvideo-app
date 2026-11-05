import { describe, expect, it } from 'vitest';
import { shellSaveMessageKey } from './shell-save-status';
import { creatorT } from './creator-ui-messages';

describe('shell save status honesty (MV-AUD-002)', () => {
  it('never maps idle/checking/unavailable to a permanent Saved automatically claim', () => {
    expect(creatorT('en', shellSaveMessageKey('idle'))).toBe('Waiting to save');
    expect(creatorT('en', shellSaveMessageKey('checking'))).toBe('Checking save…');
    expect(creatorT('en', shellSaveMessageKey('unavailable'))).toBe(
      'Not saving — storage unavailable',
    );
    expect(creatorT('en', shellSaveMessageKey('saved'))).toBe('Saved');
    expect(creatorT('en', 'creator.saved')).not.toMatch(/automatically/i);
  });

  it('uses failure and offline copy when a write was not acknowledged', () => {
    expect(creatorT('en', shellSaveMessageKey('failed'))).toMatch(/Could not save/i);
    expect(creatorT('en', shellSaveMessageKey('offline'))).toMatch(/not saved/i);
  });
});
