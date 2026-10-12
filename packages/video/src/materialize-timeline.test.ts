import { describe, expect, it } from 'vitest';

import { buildInitialTimeline } from '@memorialvideo/domain';

import { materializeQueuedTimeline, queuedPublicPath } from './materialize-timeline';

describe('materialize queued timeline', () => {
  it('rewrites storage variant srcs without fetching remote URLs', async () => {
    const timeline = buildInitialTimeline({
      displayName: 'Alex Rivera',
      locale: 'en',
      themeKey: 'timeless',
      assets: [
        {
          id: 'asset-1',
          type: 'image',
          src: 'storage://project-variants/projects/p1/v.jpg',
          capturedAt: null,
        },
      ],
    });
    const published: string[] = [];
    const next = await materializeQueuedTimeline(
      timeline,
      async (key) => {
        expect(key).toBe('projects/p1/v.jpg');
        return new Uint8Array([1, 2, 3]);
      },
      async (_bytes, relativePath) => {
        published.push(relativePath);
      },
    );
    const image = next.scenes.find((scene) => scene.type === 'image');
    expect(image?.type === 'image' && image.asset.src).toBe(queuedPublicPath('asset-1', 'image'));
    expect(published).toEqual([queuedPublicPath('asset-1', 'image')]);
    expect(JSON.stringify(next)).not.toMatch(/https?:|file:/);
  });

  it('leaves bundled fixture srcs untouched', async () => {
    const timeline = buildInitialTimeline({
      displayName: 'Alex Rivera',
      locale: 'en',
      themeKey: 'timeless',
      assets: [{ id: 'asset-1', type: 'image', src: 'fixtures/generated/photo.jpg', capturedAt: null }],
    });
    const next = await materializeQueuedTimeline(
      timeline,
      async () => {
        throw new Error('should_not_download');
      },
      async () => {
        throw new Error('should_not_publish');
      },
    );
    const image = next.scenes.find((scene) => scene.type === 'image');
    expect(image?.type === 'image' && image.asset.src).toBe('fixtures/generated/photo.jpg');
  });
});
