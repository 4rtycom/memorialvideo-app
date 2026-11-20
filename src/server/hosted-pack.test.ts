import { describe, expect, it } from 'vitest';
import { assembleCeremonyPackZip } from './ceremony-pack-local';
import { renderObjectKey } from './object-storage';
import type { Tribute } from './store';

describe('hosted render objects', () => {
  it('names objects per kind', () => {
    expect(renderObjectKey('t', 'j', 'mp4')).toBe('t/j.mp4');
    expect(renderObjectKey('t', 'j', 'poster')).toBe('t/j.poster.jpg');
    expect(renderObjectKey('t', 'j', 'pack')).toBe('t/j.pack.zip');
  });

  it('assembles the venue pack around given film bytes', () => {
    const tribute = {
      publicId: 'trb_test',
      displayName: 'Anna',
      locale: 'en',
      themeKey: 'soft',
      soundtrackTrackId: null,
      timelineVersion: 1,
      ceremonyChecklist: {},
      memories: [],
      renderJobs: [],
    } as unknown as Tribute;
    const film = new Uint8Array([1, 2, 3, 4]);
    const result = assembleCeremonyPackZip(tribute, film);
    const text = Buffer.from(result.bytes).toString('latin1');
    expect(result.fileName.endsWith('-ceremony-pack.zip')).toBe(true);
    expect(text).toContain('manifest.json');
    expect(text).toContain('tribute-metadata.json');
    expect(text).toContain('.mp4');
  });
});
