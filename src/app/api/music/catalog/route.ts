import { NextResponse } from 'next/server';
import { isMusicCatalogEnabled } from '@memorialvideo/config/env';
import { BETA_MUSIC_CATALOG, suggestedTributeTrack } from '@memorialvideo/domain';
import { creatorEnv } from '@/server/env';

export const runtime = 'nodejs';

/** Synthetic development_only catalog — licensed masters remain XB-002. */
export async function GET() {
  const env = creatorEnv();
  if (!isMusicCatalogEnabled(env)) {
    return NextResponse.json(
      {
        tracks: [],
        enabled: false,
        userUploadEnabled: false,
        note: 'Music catalog disabled (MUSIC_CATALOG_ENABLED=false).',
      },
      { status: 404 },
    );
  }
  const suggested = suggestedTributeTrack();
  return NextResponse.json({
    enabled: true,
    tracks: BETA_MUSIC_CATALOG.filter((t) => t.licenseStatus !== 'retired').map((track) => ({
      trackId: track.trackId,
      title: track.title,
      artistDisplay: track.artistDisplay,
      mood: track.moodTags.join(', '),
      licenseStatus: track.licenseStatus,
      momentTags: track.momentTags,
      licensedForPreview: track.licensedForPreview,
      licensedForDownload: track.licensedForDownload,
      previewUrl: `/api/music/preview?trackId=${encodeURIComponent(track.trackId)}`,
      userUploaded: false,
    })),
    suggestedTrackId: suggested.trackId,
    userUploadEnabled: false,
    note: 'Beta catalog is development_only synthetic. User-uploaded commercial music stays off. Licensed masters: XB-002.',
  });
}
