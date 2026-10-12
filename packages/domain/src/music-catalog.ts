import type { CeremonyMusicMoment, CeremonyMusicMood } from '@memorialvideo/contracts';

export type CatalogTrack = {
  trackId: string;
  licensedForDownload: boolean;
  licensedForPrivateStream: boolean;
  userUploaded: false;
};

export type CatalogTrackMeta = CatalogTrack & {
  title: string;
  artistDisplay: string;
  durationMs: number;
  momentTags: readonly CeremonyMusicMoment[];
  moodTags: readonly CeremonyMusicMood[];
  previewSrc: string;
  licenseStatus: 'development_only' | 'approved' | 'retired';
  licensedForPreview: boolean;
};

/** Synthetic development catalog — replace with DB-backed licensed tracks when XB-002 clears. */
export const BETA_MUSIC_CATALOG: readonly CatalogTrackMeta[] = [
  {
    trackId: 'still-water',
    title: 'Still Water',
    artistDisplay: 'MemorialVideo fixtures',
    durationMs: 45_000,
    momentTags: ['tribute', 'reflection'],
    moodTags: ['calm'],
    previewSrc: 'fixtures/multitrack/music-synthetic.wav',
    licenseStatus: 'development_only',
    licensedForDownload: false,
    licensedForPrivateStream: false,
    licensedForPreview: true,
    userUploaded: false,
  },
  {
    trackId: 'warm-room',
    title: 'Warm Room',
    artistDisplay: 'MemorialVideo fixtures',
    durationMs: 45_000,
    momentTags: ['tribute', 'opening', 'closing'],
    moodTags: ['warm'],
    previewSrc: 'fixtures/multitrack/music-synthetic.wav',
    licenseStatus: 'development_only',
    licensedForDownload: false,
    licensedForPrivateStream: false,
    licensedForPreview: true,
    userUploaded: false,
  },
  {
    trackId: 'gentle-rise',
    title: 'Gentle Rise',
    artistDisplay: 'MemorialVideo fixtures',
    durationMs: 45_000,
    momentTags: ['closing', 'reflection'],
    moodTags: ['uplifting'],
    previewSrc: 'fixtures/multitrack/music-synthetic.wav',
    licenseStatus: 'development_only',
    licensedForDownload: false,
    licensedForPrivateStream: false,
    licensedForPreview: true,
    userUploaded: false,
  },
  {
    trackId: 'quiet-hope',
    title: 'Quiet Hope',
    artistDisplay: 'MemorialVideo fixtures',
    durationMs: 45_000,
    momentTags: ['opening', 'tribute'],
    moodTags: ['warm', 'calm'],
    previewSrc: 'fixtures/multitrack/music-synthetic.wav',
    licenseStatus: 'development_only',
    licensedForDownload: false,
    licensedForPrivateStream: false,
    licensedForPreview: true,
    userUploaded: false,
  },
];

export function catalogTrackById(trackId: string): CatalogTrackMeta | undefined {
  return BETA_MUSIC_CATALOG.find((track) => track.trackId === trackId);
}

export function catalogTracksForMoment(moment: CeremonyMusicMoment): readonly CatalogTrackMeta[] {
  return BETA_MUSIC_CATALOG.filter((track) => track.momentTags.includes(moment) && track.licenseStatus !== 'retired');
}

export function suggestedTributeTrack(): CatalogTrackMeta {
  return catalogTracksForMoment('tribute')[0] ?? BETA_MUSIC_CATALOG[0]!;
}
