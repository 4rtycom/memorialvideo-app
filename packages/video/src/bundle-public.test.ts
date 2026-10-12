import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { publishGeneratedAssetToBundle, remotionBundledPublicPath } from './bundle-public';

describe('bundle public assets', () => {
  it('places a post-bundle file where Remotion staticFile() will look', async () => {
    const serveUrl = await mkdtemp(path.join(tmpdir(), 'mv-bundle-'));
    const source = path.join(serveUrl, 'source-clip.mp4');
    await writeFile(source, 'clip');

    const destination = await publishGeneratedAssetToBundle(
      serveUrl,
      source,
      'fixtures/generated/clip-phone.mp4',
    );

    expect(destination).toBe(
      remotionBundledPublicPath(serveUrl, 'fixtures/generated/clip-phone.mp4'),
    );
    expect(await readFile(destination, 'utf8')).toBe('clip');
  });
});
