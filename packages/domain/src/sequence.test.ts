import { describe, expect, it } from 'vitest';

import { buildInitialTimeline, moveItem, sortAssetsForSequence, splitAssetsAcrossChapters } from './sequence';

const photo = (id: string, capturedAt: string | null) => ({
  id,
  type: 'image' as const,
  src: `asset://${id}`,
  capturedAt,
});

describe('initial sequence', () => {
  it('puts dated memories first and unknown dates last', () => {
    const ordered = sortAssetsForSequence([
      photo('c', null),
      photo('a', '1960-01-01T00:00:00.000Z'),
      photo('b', '1980-06-01T00:00:00.000Z'),
    ]);
    expect(ordered.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('builds a valid contract with intro, chapter, images and outro', () => {
    const timeline = buildInitialTimeline({
      displayName: 'Alex Rivera',
      lifeSpanLabel: '1948–2024',
      chapterTitle: 'Early years',
      locale: 'en',
      themeKey: 'timeless',
      assets: [photo('a', '1960-01-01T00:00:00.000Z')],
    });
    expect(timeline.scenes.map((scene) => scene.type)).toEqual(['intro', 'chapter', 'image', 'outro']);
    expect(timeline.scenes.every((scene) => Number.isInteger(scene.durationFrames))).toBe(true);
  });

  it('builds a portrait contract when asked', () => {
    const timeline = buildInitialTimeline({
      displayName: 'Alex',
      locale: 'en',
      themeKey: 'family_album',
      aspect: '9:16',
      assets: [photo('a', null)],
    });
    expect(timeline.width).toBe(1080);
    expect(timeline.height).toBe(1920);
    expect(timeline.themeKey).toBe('family_album');
  });

  it('splits memories across named chapters', () => {
    expect(splitAssetsAcrossChapters(['a', 'b', 'c', 'd'], 2)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    const timeline = buildInitialTimeline({
      displayName: 'Alex Rivera',
      chapters: ['Early years', 'Later years'],
      locale: 'en',
      themeKey: 'timeless',
      assets: [photo('a', '1960-01-01T00:00:00.000Z'), photo('b', '1980-01-01T00:00:00.000Z')],
    });
    expect(timeline.scenes.map((scene) => scene.type)).toEqual([
      'intro',
      'chapter',
      'image',
      'chapter',
      'image',
      'outro',
    ]);
    const titles = timeline.scenes.filter((scene) => scene.type === 'chapter').map((scene) => scene.title);
    expect(titles).toEqual(['Early years', 'Later years']);
  });

  it('reorders with a keyboard-safe helper', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b'], 4, 0)).toEqual(['a', 'b']);
  });

  it('keeps scene ids unique when two memories share an asset id', () => {
    const timeline = buildInitialTimeline({
      displayName: 'Alex Rivera',
      chapterTitle: 'Early years',
      locale: 'en',
      themeKey: 'timeless',
      assets: [photo('shared', null), photo('shared', null)],
    });
    const ids = timeline.scenes.map((scene) => scene.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id.startsWith('image-shared'))).toEqual(['image-shared', 'image-shared-2']);
  });
});
