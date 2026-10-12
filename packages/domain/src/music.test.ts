import { describe, expect, it } from 'vitest';

import { canAttachCatalogTrack } from './music';

describe('music rights gate', () => {
  it('allows licensed catalog tracks, and user uploads only when the rights flag is on', () => {
    expect(
      canAttachCatalogTrack({
        licensedForDownload: true,
        licensedForPrivateStream: true,
        userUploaded: false,
        featureUserUploads: false,
      }),
    ).toBe(true);
    expect(
      canAttachCatalogTrack({
        licensedForDownload: true,
        licensedForPrivateStream: false,
        userUploaded: false,
        featureUserUploads: false,
      }),
    ).toBe(false);
    expect(
      canAttachCatalogTrack({
        licensedForDownload: true,
        licensedForPrivateStream: true,
        userUploaded: true,
        featureUserUploads: false,
      }),
    ).toBe(false);
    expect(
      canAttachCatalogTrack({
        licensedForDownload: false,
        licensedForPrivateStream: false,
        userUploaded: true,
        featureUserUploads: true,
      }),
    ).toBe(true);
  });
});
