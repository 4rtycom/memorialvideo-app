import { describe, expect, it } from 'vitest';

import { parseMusicDirectorPlan } from './music-director';

describe('MusicDirectorPlan contract', () => {
  it('accepts Opening / Memories / Farewell with speech pauses', () => {
    const plan = parseMusicDirectorPlan({
      schemaVersion: 1,
      rightsConfirmed: true,
      slots: [
        {
          id: 'opening',
          label: 'Opening',
          order: 0,
          sourceState: 'venue_playback',
          song: { title: 'Processional', artist: '', linkUrl: null, linkPlatform: null, catalogTrackKey: null, notes: '' },
        },
        {
          id: 'memories',
          label: 'Memories',
          order: 1,
          sourceState: 'song_identified',
          song: {
            title: 'Amazing Grace',
            artist: 'Traditional',
            linkUrl: 'https://open.spotify.com/track/x',
            linkPlatform: 'spotify',
            catalogTrackKey: null,
            notes: '',
          },
        },
        {
          id: 'farewell',
          label: 'Farewell',
          order: 2,
          sourceState: 'audio_available',
          song: {
            title: 'Gentle Rise',
            artist: 'Fixtures',
            linkUrl: null,
            linkPlatform: null,
            catalogTrackKey: 'gentle-rise',
            notes: '',
          },
        },
      ],
      speechPauses: [
        {
          id: 'pause_1',
          afterSlot: 'memories',
          label: 'Eulogy',
          waitingNote: 'Resume when ready',
          enabled: true,
        },
      ],
    });
    expect(plan.slots).toHaveLength(3);
    expect(plan.speechPauses[0]?.afterSlot).toBe('memories');
  });
});
