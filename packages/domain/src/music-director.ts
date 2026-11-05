import {
  MUSIC_DIRECTOR_SLOTS,
  parseMusicDirectorPlan,
  type CeremonyMusicPlan,
  type MusicDirectorPlan,
  type MusicDirectorSlot,
  type MusicDirectorSlotId,
  type MusicLinkPlatform,
  type MusicSourceState,
  type MusicSongReference,
} from '@memorialvideo/contracts';

import { catalogTrackById, type CatalogTrackMeta } from './music-catalog';

const SLOT_LABELS: Record<MusicDirectorSlotId, string> = {
  opening: 'Opening',
  memories: 'Memories',
  farewell: 'Farewell',
};

/** Map family Music Director slots onto the existing CeremonyMusicPlan moments. */
const SLOT_TO_CEREMONY: Record<MusicDirectorSlotId, 'opening' | 'tribute' | 'closing'> = {
  opening: 'opening',
  memories: 'tribute',
  farewell: 'closing',
};

export function defaultMusicDirectorSlots(): MusicDirectorSlot[] {
  return MUSIC_DIRECTOR_SLOTS.map((id, order) => ({
    id,
    label: SLOT_LABELS[id],
    order,
    sourceState: 'empty' as const,
    song: {
      title: '',
      artist: '',
      linkUrl: null,
      linkPlatform: null,
      catalogTrackKey: null,
      notes: '',
    },
  }));
}

export function defaultMusicDirectorPlan(partial?: {
  rightsConfirmed?: boolean;
  soundtrackTrackId?: string | null;
}): MusicDirectorPlan {
  const slots = defaultMusicDirectorSlots();
  if (partial?.soundtrackTrackId) {
    const track = catalogTrackById(partial.soundtrackTrackId);
    const memories = slots.find((slot) => slot.id === 'memories');
    if (memories && track) {
      memories.song = {
        title: track.title,
        artist: track.artistDisplay,
        linkUrl: null,
        linkPlatform: null,
        catalogTrackKey: track.trackId,
        notes: '',
      };
      memories.sourceState = inferSourceState(memories.song, {
        preferVenue: false,
        catalog: track,
      });
    }
  }
  return parseMusicDirectorPlan({
    schemaVersion: 1,
    slots,
    speechPauses: [],
    rightsConfirmed: partial?.rightsConfirmed ?? false,
    updatedAt: null,
  });
}

export function detectMusicLinkPlatform(url: string): MusicLinkPlatform | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  let host = '';
  try {
    host = new URL(trimmed).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host.includes('spotify.com') || host === 'spotify.link') return 'spotify';
  if (host.includes('music.apple.com') || host.includes('itunes.apple.com')) return 'apple_music';
  if (
    host.includes('youtube.com') ||
    host === 'youtu.be' ||
    host.includes('music.youtube.com')
  ) {
    return 'youtube';
  }
  if (host.includes('.')) return 'other';
  return null;
}

export function isSongReferenceLink(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  return detectMusicLinkPlatform(url) !== null;
}

export function inferSourceState(
  song: MusicSongReference,
  options?: {
    preferVenue?: boolean;
    catalog?: CatalogTrackMeta | null;
    licensedEmbed?: boolean;
  },
): MusicSourceState {
  const hasTitle = Boolean(song.title.trim() || song.artist.trim());
  const hasLink = Boolean(song.linkUrl?.trim());
  const catalog =
    options?.catalog ??
    (song.catalogTrackKey ? catalogTrackById(song.catalogTrackKey) : undefined);

  if (options?.preferVenue && (hasTitle || hasLink || catalog)) {
    return 'venue_playback';
  }
  if (options?.licensedEmbed && catalog?.licenseStatus === 'approved') {
    return 'embedded_audio_licensed';
  }
  if (catalog?.licensedForPreview) {
    return 'audio_available';
  }
  if (hasTitle || hasLink) {
    return 'song_identified';
  }
  return 'empty';
}

export function withInferredSourceStates(plan: MusicDirectorPlan): MusicDirectorPlan {
  return parseMusicDirectorPlan({
    ...plan,
    slots: plan.slots.map((slot) => ({
      ...slot,
      sourceState: inferSourceState(slot.song, {
        preferVenue: slot.sourceState === 'venue_playback',
        licensedEmbed: slot.sourceState === 'embedded_audio_licensed',
      }),
    })),
  });
}

/** Build CeremonyMusicPlan for TimelineContract / AudioMix adapters — catalog audio only. */
export function musicDirectorToCeremonyPlan(plan: MusicDirectorPlan): CeremonyMusicPlan {
  const byId = new Map(plan.slots.map((slot) => [slot.id, slot]));
  const opening = byId.get('opening');
  const memories = byId.get('memories');
  const farewell = byId.get('farewell');

  const openingKey =
    opening &&
    (opening.sourceState === 'audio_available' ||
      opening.sourceState === 'embedded_audio_licensed')
      ? opening.song.catalogTrackKey
      : null;
  const memoriesKey =
    memories &&
    (memories.sourceState === 'audio_available' ||
      memories.sourceState === 'embedded_audio_licensed')
      ? memories.song.catalogTrackKey
      : null;
  const farewellKey =
    farewell &&
    (farewell.sourceState === 'audio_available' ||
      farewell.sourceState === 'embedded_audio_licensed')
      ? farewell.song.catalogTrackKey
      : null;

  const venueOpening =
    opening?.sourceState === 'venue_playback' ||
    (opening?.sourceState === 'song_identified' && !openingKey);

  const hasMultiple = Boolean(
    (openingKey && memoriesKey) ||
      (openingKey && farewellKey) ||
      (memoriesKey && farewellKey) ||
      openingKey ||
      farewellKey,
  );

  return {
    mode: hasMultiple || openingKey || farewellKey ? 'moments' : 'single',
    slots: {
      opening: {
        trackKey: openingKey,
        venueHandled: Boolean(venueOpening) || !openingKey,
      },
      tribute: {
        trackKey: memoriesKey,
      },
      reflection: { trackKey: null },
      closing: {
        trackKey: farewellKey,
      },
    },
  };
}

/** Hydrate Music Director from a legacy CeremonyMusicPlan + soundtrack. */
export function ceremonyPlanToMusicDirector(input: {
  plan: CeremonyMusicPlan | null;
  soundtrackTrackId?: string | null;
  rightsConfirmed?: boolean;
  existing?: MusicDirectorPlan | null;
}): MusicDirectorPlan {
  if (input.existing?.slots?.length) {
    return withInferredSourceStates(
      parseMusicDirectorPlan({
        ...input.existing,
        rightsConfirmed: input.rightsConfirmed ?? input.existing.rightsConfirmed,
      }),
    );
  }

  const base = defaultMusicDirectorPlan({
    rightsConfirmed: input.rightsConfirmed,
    soundtrackTrackId: input.soundtrackTrackId,
  });
  if (!input.plan) {
    return base;
  }

  const slots = base.slots.map((slot) => {
    const ceremonyKey = SLOT_TO_CEREMONY[slot.id];
    const ceremonySlot = input.plan!.slots[ceremonyKey];
    const trackKey = ceremonySlot.trackKey;
    const track = trackKey ? catalogTrackById(trackKey) : undefined;
    if (!trackKey && ceremonyKey === 'opening' && ceremonySlot.venueHandled) {
      return {
        ...slot,
        sourceState: 'venue_playback' as const,
      };
    }
    if (!track || !trackKey) {
      return slot;
    }
    const song = {
      title: track.title,
      artist: track.artistDisplay,
      linkUrl: null as string | null,
      linkPlatform: null as MusicLinkPlatform | null,
      catalogTrackKey: track.trackId,
      notes: '',
    };
    return {
      ...slot,
      song,
      sourceState: inferSourceState(song, { catalog: track }),
    };
  });

  return parseMusicDirectorPlan({
    ...base,
    slots,
    rightsConfirmed: input.rightsConfirmed ?? false,
  });
}

export function musicDirectorApplyTrackKey(plan: MusicDirectorPlan): string | null {
  const memories = plan.slots.find((slot) => slot.id === 'memories');
  if (memories?.song.catalogTrackKey) return memories.song.catalogTrackKey;
  const withAudio = plan.slots.find(
    (slot) =>
      slot.song.catalogTrackKey &&
      (slot.sourceState === 'audio_available' || slot.sourceState === 'embedded_audio_licensed'),
  );
  return withAudio?.song.catalogTrackKey ?? null;
}

export function musicDirectorHasPlayableAudio(plan: MusicDirectorPlan): boolean {
  return plan.slots.some(
    (slot) =>
      Boolean(slot.song.catalogTrackKey) &&
      (slot.sourceState === 'audio_available' || slot.sourceState === 'embedded_audio_licensed'),
  );
}

export function musicDirectorSlotSummary(slot: MusicDirectorSlot): string {
  if (slot.sourceState === 'empty') return 'Not chosen yet';
  const name = [slot.song.title, slot.song.artist].filter(Boolean).join(' · ');
  switch (slot.sourceState) {
    case 'song_identified':
      return name ? `${name} · song noted for the venue` : 'Song noted';
    case 'audio_available':
      return name ? `${name} · ready to preview` : 'Ready to preview';
    case 'venue_playback':
      return name ? `${name} · venue will play` : 'Venue will play';
    case 'embedded_audio_licensed':
      return name ? `${name} · licensed in the film` : 'Licensed in the film';
    default:
      return name || 'Not chosen yet';
  }
}

export { SLOT_LABELS, SLOT_TO_CEREMONY };
