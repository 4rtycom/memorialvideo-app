'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type {
  LaunchLanguage,
  MusicDirectorPlan,
  MusicDirectorSlot,
  MusicDirectorSlotId,
  MusicSourceState,
} from '@memorialvideo/contracts';
import { Button, Card, ErrorState } from '@/components/ui';
import { creatorT } from '@/lib/creator-ui-messages';

type CatalogTrack = {
  trackId: string;
  title: string;
  artistDisplay?: string;
  mood: string;
  licenseStatus: string;
  previewUrl?: string;
  momentTags?: string[];
};

type LoadBody = {
  enabled?: boolean;
  plan?: MusicDirectorPlan;
  hasTimeline?: boolean;
  applied?: boolean;
  clipCount?: number;
  hasPlayableAudio?: boolean;
  openingTitle?: string;
  displayName?: string;
  note?: string;
  error?: string;
};

const SOURCE_LABELS: Record<MusicSourceState, string> = {
  empty: 'Not chosen yet',
  song_identified: 'Song noted — venue can play',
  audio_available: 'Preview available',
  venue_playback: 'Venue will play this',
  embedded_audio_licensed: 'Licensed in the film',
};

function emptySong() {
  return {
    title: '',
    artist: '',
    linkUrl: null as string | null,
    linkPlatform: null as MusicDirectorSlot['song']['linkPlatform'],
    catalogTrackKey: null as string | null,
    notes: '',
  };
}

function detectPlatform(url: string): MusicDirectorSlot['song']['linkPlatform'] {
  const trimmed = url.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed.includes('spotify.')) return 'spotify';
  if (trimmed.includes('music.apple.') || trimmed.includes('itunes.apple.')) return 'apple_music';
  if (trimmed.includes('youtube.') || trimmed.includes('youtu.be')) return 'youtube';
  try {
    // eslint-disable-next-line no-new
    new URL(url.trim());
    return 'other';
  } catch {
    return null;
  }
}

function inferSlotState(slot: MusicDirectorSlot): MusicSourceState {
  if (slot.sourceState === 'venue_playback') return 'venue_playback';
  if (slot.song.catalogTrackKey) return 'audio_available';
  if (slot.song.title.trim() || slot.song.artist.trim() || slot.song.linkUrl) {
    return 'song_identified';
  }
  return 'empty';
}

function withInferred(plan: MusicDirectorPlan): MusicDirectorPlan {
  return {
    ...plan,
    slots: plan.slots.map((slot) => ({
      ...slot,
      sourceState: inferSlotState(slot),
    })),
  };
}

export function MusicDirectorPanel({
  locale = 'en',
  compact = false,
  openingTitle: openingTitleProp = '',
  displayName = '',
}: {
  locale?: LaunchLanguage;
  /** Compact embed for Guided Edit — same Music Director, less chrome. */
  compact?: boolean;
  openingTitle?: string;
  displayName?: string;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<MusicDirectorPlan | null>(null);
  const [tracks, setTracks] = useState<CatalogTrack[]>([]);
  const [search, setSearch] = useState('');
  const [activeSlot, setActiveSlot] = useState<MusicDirectorSlotId>('memories');
  const [openingTitle, setOpeningTitle] = useState(openingTitleProp || displayName);
  const [hasTimeline, setHasTimeline] = useState(false);
  const [applied, setApplied] = useState(false);
  const [clipCount, setClipCount] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [pending, startTransition] = useTransition();
  const [previewNote, setPreviewNote] = useState<string | null>(null);

  const filteredTracks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tracks;
    return tracks.filter((track) => {
      const hay = `${track.title} ${track.artistDisplay ?? ''} ${track.mood}`.toLowerCase();
      return hay.includes(q);
    });
  }, [tracks, search]);

  function loadAll() {
    setLoadState('loading');
    setError(null);
    void Promise.all([
      fetch('/api/music-director').then(async (r) => {
        const body = (await r.json()) as LoadBody;
        if (!r.ok) {
          throw new Error(body.error ?? 'load_failed');
        }
        return body;
      }),
      fetch('/api/music/catalog').then(async (r) => {
        if (!r.ok) return { tracks: [] as CatalogTrack[] };
        return (await r.json()) as { tracks: CatalogTrack[] };
      }),
    ])
      .then(([director, catalog]) => {
        if (director.enabled === false) {
          setError('Music choices are unavailable on this host.');
          setLoadState('failed');
          return;
        }
        if (director.plan) {
          setPlan(withInferred(director.plan));
        }
        setHasTimeline(Boolean(director.hasTimeline));
        setApplied(Boolean(director.applied));
        setClipCount(director.clipCount ?? 0);
        if (director.openingTitle !== undefined) {
          setOpeningTitle(director.openingTitle || director.displayName || displayName);
        }
        setTracks(catalog.tracks ?? []);
        setLoadState('ready');
      })
      .catch(() => {
        setError(creatorT(locale, 'creator.music.directorLoadFailed'));
        setLoadState('failed');
      });
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateSlot(slotId: MusicDirectorSlotId, patch: Partial<MusicDirectorSlot>) {
    setPlan((prev) => {
      if (!prev) return prev;
      return withInferred({
        ...prev,
        slots: prev.slots.map((slot) => (slot.id === slotId ? { ...slot, ...patch } : slot)),
      });
    });
    setApplied(false);
    setStatus(null);
  }

  function chooseCatalogTrack(track: CatalogTrack) {
    updateSlot(activeSlot, {
      song: {
        title: track.title,
        artist: track.artistDisplay ?? '',
        linkUrl: null,
        linkPlatform: null,
        catalogTrackKey: track.trackId,
        notes: '',
      },
      sourceState: 'audio_available',
    });
  }

  function previewTrack(track: CatalogTrack) {
    setPreviewNote(null);
    if (!track.previewUrl) return;
    const audio = new Audio(track.previewUrl);
    void audio.play().catch(() => {
      setPreviewNote(creatorT(locale, 'creator.music.previewUnavailable'));
    });
  }

  function addSpeechPause(afterSlot: MusicDirectorSlotId) {
    setPlan((prev) => {
      if (!prev) return prev;
      const id = `pause_${afterSlot}_${Date.now().toString(36)}`;
      return {
        ...prev,
        speechPauses: [
          ...prev.speechPauses,
          {
            id,
            afterSlot,
            label: creatorT(locale, 'creator.music.pauseDefaultLabel'),
            waitingNote: creatorT(locale, 'creator.music.pauseDefaultNote'),
            enabled: true,
          },
        ],
      };
    });
  }

  function removeSpeechPause(id: string) {
    setPlan((prev) => {
      if (!prev) return prev;
      return { ...prev, speechPauses: prev.speechPauses.filter((pause) => pause.id !== id) };
    });
  }

  function saveOpeningTitle() {
    startTransition(async () => {
      await fetch('/api/tributes/active', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ openingTitle: openingTitle.trim() }),
      });
      router.refresh();
    });
  }

  function run(action: 'save' | 'apply') {
    if (!plan) return;
    setError(null);
    setStatus(null);
    const payload = withInferred({
      ...plan,
      rightsConfirmed: plan.rightsConfirmed,
      updatedAt: new Date().toISOString(),
    });
    startTransition(async () => {
      const response = await fetch('/api/music-director', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, plan: payload }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        plan?: MusicDirectorPlan;
        clipCount?: number;
        applied?: boolean;
      };
      if (!response.ok) {
        setError(
          body.message ??
            (body.error === 'needs_timeline'
              ? creatorT(locale, 'creator.music.needFilm')
              : creatorT(locale, 'creator.music.directorSaveFailed')),
        );
        return;
      }
      if (body.plan) setPlan(withInferred(body.plan));
      if (typeof body.clipCount === 'number') setClipCount(body.clipCount);
      if (typeof body.applied === 'boolean') setApplied(body.applied);
      if (action === 'apply' && body.applied) setHasTimeline(true);
      setStatus(
        body.message ??
          (action === 'apply'
            ? creatorT(locale, 'creator.music.directorApplied')
            : creatorT(locale, 'creator.music.directorSaved')),
      );
      router.refresh();
    });
  }

  const active = plan?.slots.find((slot) => slot.id === activeSlot) ?? null;

  if (loadState === 'loading' && !plan) {
    return (
      <Card className="!p-7" data-testid="music-director-panel">
        <p className="text-[13px] text-[color:var(--muted)] m-0" role="status">
          {creatorT(locale, 'creator.music.directorLoading')}
        </p>
      </Card>
    );
  }

  if (loadState === 'failed' && !plan) {
    return (
      <Card className="!p-7" data-testid="music-director-panel">
        <ErrorState
          title={error ?? creatorT(locale, 'creator.music.directorLoadFailed')}
          body={creatorT(locale, 'creator.music.safe')}
          action={
            <Button variant="secondary" onClick={loadAll}>
              {creatorT(locale, 'creator.music.retry')}
            </Button>
          }
        />
      </Card>
    );
  }

  if (!plan) return null;

  return (
    <div className="grid gap-5" data-testid="music-director-panel">
      {!compact ? (
        <Card className="!p-7">
          <h2 className="serif text-[33px] m-0 mb-2">{creatorT(locale, 'creator.music.opening')}</h2>
          <p className="text-[color:var(--muted)] mb-4">{creatorT(locale, 'creator.music.openingHint')}</p>
          <input
            className="field mb-4"
            value={openingTitle}
            onChange={(e) => setOpeningTitle(e.target.value)}
            maxLength={180}
            aria-label={creatorT(locale, 'creator.music.opening')}
          />
          <Button disabled={pending} onClick={saveOpeningTitle}>
            {creatorT(locale, 'creator.music.saveOpening')}
          </Button>
        </Card>
      ) : null}

      <Card className="!p-7">
        <h2 className="serif text-[33px] m-0 mb-2">{creatorT(locale, 'creator.music.directorTitle')}</h2>
        <p className="text-[color:var(--muted)] mb-4">{creatorT(locale, 'creator.music.directorIntro')}</p>

        <div className="grid gap-3 mb-5 sm:grid-cols-3" role="tablist" aria-label="Song moments">
          {plan.slots.map((slot) => {
            const selected = slot.id === activeSlot;
            return (
              <button
                key={slot.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`rounded-[9px] min-h-[96px] px-4 py-3 text-left border-0 ${
                  selected ? 'bg-[color:var(--cinema-soft)]' : 'bg-[color:var(--bg)]'
                }`}
                onClick={() => setActiveSlot(slot.id)}
              >
                <div className="font-medium text-[18px]">{slot.label}</div>
                <div className="text-[13px] text-[color:var(--muted)] mt-1">
                  {slot.song.title || SOURCE_LABELS[slot.sourceState]}
                </div>
                <div className="text-[12px] mt-2 text-[color:var(--primary)]">
                  {SOURCE_LABELS[slot.sourceState]}
                </div>
              </button>
            );
          })}
        </div>

        {active ? (
          <div className="grid gap-4 mb-5" data-testid={`music-slot-${active.id}`}>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-[13px] text-[color:var(--muted)]">
                {creatorT(locale, 'creator.music.songTitle')}
                <input
                  className="field mt-1"
                  value={active.song.title}
                  onChange={(e) =>
                    updateSlot(active.id, {
                      song: { ...active.song, title: e.target.value, catalogTrackKey: null },
                    })
                  }
                  maxLength={160}
                />
              </label>
              <label className="text-[13px] text-[color:var(--muted)]">
                {creatorT(locale, 'creator.music.songArtist')}
                <input
                  className="field mt-1"
                  value={active.song.artist}
                  onChange={(e) =>
                    updateSlot(active.id, {
                      song: { ...active.song, artist: e.target.value, catalogTrackKey: null },
                    })
                  }
                  maxLength={160}
                />
              </label>
            </div>

            <label className="text-[13px] text-[color:var(--muted)]">
              {creatorT(locale, 'creator.music.songLink')}
              <input
                className="field mt-1"
                value={active.song.linkUrl ?? ''}
                placeholder="https://open.spotify.com/… or Apple Music / YouTube"
                onChange={(e) => {
                  const linkUrl = e.target.value.trim() || null;
                  updateSlot(active.id, {
                    song: {
                      ...active.song,
                      linkUrl,
                      linkPlatform: linkUrl ? detectPlatform(linkUrl) : null,
                      catalogTrackKey: null,
                    },
                  });
                }}
                maxLength={500}
              />
              <span className="block text-[12px] mt-1">
                {creatorT(locale, 'creator.music.songLinkHint')}
              </span>
            </label>

            <div className="flex flex-wrap gap-3">
              <Button
                variant={active.sourceState === 'venue_playback' ? 'primary' : 'secondary'}
                disabled={pending}
                onClick={() =>
                  updateSlot(active.id, {
                    sourceState:
                      active.sourceState === 'venue_playback' ? inferSlotState({
                        ...active,
                        sourceState: 'empty',
                      }) : 'venue_playback',
                  })
                }
              >
                {creatorT(locale, 'creator.music.markVenue')}
              </Button>
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  updateSlot(active.id, {
                    sourceState: 'empty',
                    song: emptySong(),
                  })
                }
              >
                {creatorT(locale, 'creator.music.clearSlot')}
              </Button>
            </div>
          </div>
        ) : null}

        <label className="text-[13px] text-[color:var(--muted)] block mb-3">
          {creatorT(locale, 'creator.music.search')}
          <input
            className="field mt-1"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={creatorT(locale, 'creator.music.searchPlaceholder')}
          />
        </label>

        <div className="grid gap-3 mb-5 max-h-[320px] overflow-auto">
          {filteredTracks.map((track) => {
            const selected = active?.song.catalogTrackKey === track.trackId;
            return (
              <div
                key={track.trackId}
                className={`rounded-[9px] min-h-[72px] px-4 py-3 grid grid-cols-[40px_1fr_auto] items-center gap-3 ${
                  selected ? 'bg-[color:var(--cinema-soft)]' : 'bg-[color:var(--bg)]'
                }`}
              >
                <button
                  type="button"
                  className="text-[23px] bg-transparent border-0 p-0"
                  aria-label={creatorT(locale, 'creator.music.preview')}
                  onClick={() => previewTrack(track)}
                >
                  ▷
                </button>
                <button
                  type="button"
                  disabled={pending}
                  className="text-left bg-transparent border-0 p-0"
                  onClick={() => chooseCatalogTrack(track)}
                >
                  <div className="font-medium text-[17px]">{track.title}</div>
                  <div className="text-[13px] text-[color:var(--muted)]">
                    {track.artistDisplay ?? track.mood}
                    {track.momentTags?.length ? ` · ${track.momentTags.join(', ')}` : ''}
                  </div>
                </button>
                <span className="text-[12px] text-[color:var(--muted)]">
                  {selected ? creatorT(locale, 'creator.music.selected') : creatorT(locale, 'creator.music.useSong')}
                </span>
              </div>
            );
          })}
          {filteredTracks.length === 0 ? (
            <p className="text-[13px] text-[color:var(--muted)] m-0">
              {creatorT(locale, 'creator.music.noSearchHits')}
            </p>
          ) : null}
        </div>

        <section className="mb-5" aria-labelledby="speech-pauses-heading">
          <h3 id="speech-pauses-heading" className="serif text-[24px] m-0 mb-2">
            {creatorT(locale, 'creator.music.pausesTitle')}
          </h3>
          <p className="text-[color:var(--muted)] text-[14px] mb-3">
            {creatorT(locale, 'creator.music.pausesIntro')}
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {plan.slots.map((slot) => (
              <Button
                key={`pause-${slot.id}`}
                variant="secondary"
                disabled={pending}
                onClick={() => addSpeechPause(slot.id)}
              >
                {creatorT(locale, 'creator.music.addPauseAfter').replace('{slot}', slot.label)}
              </Button>
            ))}
          </div>
          {plan.speechPauses.length === 0 ? (
            <p className="text-[13px] text-[color:var(--muted)] m-0">
              {creatorT(locale, 'creator.music.noPauses')}
            </p>
          ) : (
            <ul className="list-none p-0 m-0 grid gap-2">
              {plan.speechPauses.map((pause) => (
                <li
                  key={pause.id}
                  className="rounded-[9px] bg-[color:var(--bg)] px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-medium text-[15px]">{pause.label}</div>
                    <div className="text-[13px] text-[color:var(--muted)]">
                      {pause.afterSlot
                        ? creatorT(locale, 'creator.music.pauseAfter').replace(
                            '{slot}',
                            plan.slots.find((s) => s.id === pause.afterSlot)?.label ?? pause.afterSlot,
                          )
                        : creatorT(locale, 'creator.music.pauseBefore')}
                      {pause.waitingNote ? ` · ${pause.waitingNote}` : ''}
                    </div>
                  </div>
                  <Button variant="ghost" disabled={pending} onClick={() => removeSpeechPause(pause.id)}>
                    {creatorT(locale, 'creator.music.removePause')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <label className="flex items-start gap-3 text-[14px] mb-4">
          <input
            type="checkbox"
            checked={plan.rightsConfirmed}
            disabled={pending}
            onChange={(e) =>
              setPlan((prev) => (prev ? { ...prev, rightsConfirmed: e.target.checked } : prev))
            }
          />
          <span>{creatorT(locale, 'creator.music.rights')}</span>
        </label>

        <div className="flex flex-wrap gap-3 mb-3">
          <Button variant="secondary" disabled={pending} onClick={() => run('save')}>
            {pending ? creatorT(locale, 'creator.music.working') : creatorT(locale, 'creator.music.saveChoices')}
          </Button>
          <Button
            disabled={pending || !plan.rightsConfirmed}
            onClick={() => run('apply')}
          >
            {pending ? creatorT(locale, 'creator.music.working') : creatorT(locale, 'creator.music.addToFilm')}
          </Button>
        </div>

        <p className="text-[13px] text-[color:var(--muted)] m-0 mb-2" data-testid="music-director-status">
          {applied
            ? creatorT(locale, 'creator.music.filmHasMusic').replace('{count}', String(clipCount))
            : hasTimeline
              ? creatorT(locale, 'creator.music.applyHintFamily')
              : creatorT(locale, 'creator.music.needFilmHint')}
        </p>
        <p className="text-[12px] text-[color:var(--muted)] m-0 mb-2">
          {creatorT(locale, 'creator.music.sourceTruth')}
        </p>
        <p className="text-[12px] text-[color:var(--accent)] m-0 mb-2">
          {creatorT(locale, 'creator.music.voiceBlocked')}
        </p>
        {previewNote ? (
          <p className="text-[12px] text-[color:var(--muted)] m-0 mb-2">{previewNote}</p>
        ) : null}
        {status ? (
          <p className="text-[13px] text-[color:var(--primary)] m-0 mb-2" role="status">
            {status}
          </p>
        ) : null}
        {error ? (
          <p className="text-[13px] text-[color:var(--accent)] m-0" role="alert">
            {error}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
