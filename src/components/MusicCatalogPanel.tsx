'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import type { CeremonyMusicPlan, LaunchLanguage } from '@memorialvideo/contracts';
import { Button, Card, ErrorState } from '@/components/ui';
import { creatorT } from '@/lib/creator-ui-messages';

type Track = {
  trackId: string;
  title: string;
  mood: string;
  licenseStatus: string;
  previewUrl?: string;
  momentTags?: string[];
};

function singlePlan(trackId: string): CeremonyMusicPlan {
  return {
    mode: 'single',
    slots: {
      opening: { trackKey: null, venueHandled: true },
      tribute: { trackKey: trackId },
      reflection: { trackKey: null },
      closing: { trackKey: null },
    },
  };
}

export function MusicCatalogPanel({
  selectedTrackId,
  rightsConfirmed,
  openingTitle,
  displayName,
  locale = 'en',
}: {
  selectedTrackId: string | null;
  rightsConfirmed: boolean;
  openingTitle: string;
  displayName: string;
  locale?: LaunchLanguage;
}) {
  const router = useRouter();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [title, setTitle] = useState(openingTitle || displayName);
  const [selected, setSelected] = useState(selectedTrackId);
  const [rights, setRights] = useState(rightsConfirmed);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [previewNote, setPreviewNote] = useState<string | null>(null);
  const [mixNote, setMixNote] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [hasTimeline, setHasTimeline] = useState(false);
  const [clipCount, setClipCount] = useState(0);

  function loadCatalog() {
    setCatalogState('loading');
    setCatalogError(null);
    void fetch('/api/music/catalog')
      .then(async (r) => {
        const body = (await r.json()) as { tracks: Track[]; note?: string; error?: string };
        if (!r.ok) {
          setCatalogError(body.note ?? 'Ceremony music catalog is unavailable.');
          setCatalogState('failed');
          return;
        }
        setTracks(body.tracks ?? []);
        setNote(body.note ?? null);
        setCatalogState('ready');
      })
      .catch(() => {
        setCatalogError('Could not load the ceremony music catalog.');
        setCatalogState('failed');
      });
  }

  function hydrateMix() {
    void fetch('/api/ceremony-music')
      .then(async (r) => {
        if (!r.ok) return;
        const body = (await r.json()) as {
          enabled?: boolean;
          applied?: boolean;
          hasTimeline?: boolean;
          clipCount?: number;
          soundtrackTrackId?: string | null;
          musicRightsConfirmed?: boolean;
        };
        if (body.enabled === false) return;
        setApplied(Boolean(body.applied));
        setHasTimeline(Boolean(body.hasTimeline));
        setClipCount(body.clipCount ?? 0);
        if (body.soundtrackTrackId) setSelected(body.soundtrackTrackId);
        if (typeof body.musicRightsConfirmed === 'boolean') setRights(body.musicRightsConfirmed);
      })
      .catch(() => {
        /* optional hydrate */
      });
  }

  useEffect(() => {
    loadCatalog();
    hydrateMix();
  }, []);

  function save(patch: Record<string, unknown>) {
    setError(null);
    startTransition(async () => {
      const response = await fetch('/api/tributes/active', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        setError('Could not save music settings.');
        return;
      }
      router.refresh();
    });
  }

  function preview(track: Track) {
    setPreviewNote(null);
    if (!track.previewUrl) return;
    const audio = new Audio(track.previewUrl);
    void audio.play().catch(() => {
      setPreviewNote('Preview unavailable — development fixture missing or blocked.');
    });
  }

  function applyToFilm() {
    setError(null);
    setMixNote(null);
    if (!selected) {
      setError('Choose a soundtrack first.');
      return;
    }
    if (!rights) {
      setError('Confirm rights before applying ceremony music to the film.');
      return;
    }
    startTransition(async () => {
      const plan = singlePlan(selected);
      const response = await fetch('/api/ceremony-music', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'apply', plan }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        clipCount?: number;
        licenseStatuses?: string[];
      };
      if (!response.ok) {
        if (body.error === 'needs_timeline') {
          setError(
            'Publish a first film (TimelineContract) before applying ceremony music to the mix.',
          );
          setHasTimeline(false);
          return;
        }
        setError(
          body.error === 'music_plan_empty'
            ? 'Choose a tribute soundtrack before applying.'
            : 'Could not apply ceremony music to the TimelineContract.',
        );
        return;
      }
      setApplied(true);
      setHasTimeline(true);
      setClipCount(body.clipCount ?? 0);
      setMixNote(
        `Applied AudioMixContract · ${body.clipCount ?? 0} music clip(s) · license ${
          body.licenseStatuses?.[0] ?? 'development_only'
        } (XB-002 masters still pending).`,
      );
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="!p-7">
        <h2 className="serif text-[33px] m-0 mb-2">{creatorT(locale, 'creator.music.opening')}</h2>
        <p className="text-[color:var(--muted)] mb-4">{creatorT(locale, 'creator.music.openingHint')}</p>
        <input
          className="field mb-4"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={180}
        />
        <Button disabled={pending} onClick={() => save({ openingTitle: title.trim() })}>
          Save opening title
        </Button>
      </Card>
      <Card className="!p-7">
        <h2 className="serif text-[33px] m-0 mb-2">{creatorT(locale, 'creator.music.soundtrack')}</h2>
        <p className="text-[color:var(--muted)] mb-4">{creatorT(locale, 'creator.music.devOnly')}</p>
        {catalogState === 'loading' ? (
          <p className="text-[13px] text-[color:var(--muted)] m-0 mb-4" role="status">
            Loading ceremony music…
          </p>
        ) : null}
        {catalogState === 'failed' ? (
          <div className="mb-4">
            <ErrorState
              title={catalogError ?? 'Could not load the ceremony music catalog.'}
              body="Your tribute work is still safe."
              action={
                <Button variant="secondary" onClick={loadCatalog}>
                  Retry
                </Button>
              }
            />
          </div>
        ) : null}
        {catalogState === 'ready' ? (
          <>
            <div className="grid gap-3 mb-4">
              {tracks.map((track) => (
                <div
                  key={track.trackId}
                  className={`rounded-[9px] min-h-[84px] px-4 py-3 grid grid-cols-[40px_1fr_auto] items-center gap-3 ${
                    selected === track.trackId
                      ? 'bg-[color:var(--cinema-soft)]'
                      : 'bg-[color:var(--bg)]'
                  }`}
                >
                  <button
                    type="button"
                    className="text-[23px]"
                    aria-label={creatorT(locale, 'creator.music.preview')}
                    onClick={() => preview(track)}
                  >
                    ▷
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    className="text-left bg-transparent border-0 p-0"
                    onClick={() => {
                      setSelected(track.trackId);
                      setApplied(false);
                      save({ soundtrackTrackId: track.trackId });
                    }}
                  >
                    <div className="font-medium text-[18px]">{track.title}</div>
                    <div className="text-[13px] text-[color:var(--muted)]">
                      {track.mood} · {track.licenseStatus}
                      {track.momentTags?.length ? ` · ${track.momentTags.join(', ')}` : ''}
                    </div>
                  </button>
                  <span className="text-[12px] text-[color:var(--muted)]">{track.trackId}</span>
                </div>
              ))}
            </div>
            <label className="flex items-start gap-3 text-[14px] mb-4">
              <input
                type="checkbox"
                checked={rights}
                disabled={pending}
                onChange={(e) => {
                  setRights(e.target.checked);
                  save({ musicRightsConfirmed: e.target.checked });
                }}
              />
              <span>{creatorT(locale, 'creator.music.rights')}</span>
            </label>
            <div className="flex flex-wrap gap-3 mb-4">
              <Button onClick={applyToFilm} disabled={pending || !selected || !rights}>
                {pending ? 'Working…' : creatorT(locale, 'creator.music.applyMix')}
              </Button>
              <Button variant="secondary" disabled className="opacity-60">
                {creatorT(locale, 'creator.music.uploadOff')}  ↗
              </Button>
            </div>
            {applied ? (
              <p
                className="text-[13px] text-[color:var(--primary)] mt-0 mb-2"
                data-testid="ceremony-music-applied"
              >
                AudioMix on TimelineContract · {clipCount} clip(s)
                {!hasTimeline ? '' : ''}
              </p>
            ) : (
              <p className="text-[12px] text-[color:var(--muted)] mt-0 mb-2">
                {creatorT(locale, 'creator.music.applyHint')}
              </p>
            )}
            {mixNote ? <p className="text-[12px] text-[color:var(--muted)] mt-2 mb-0">{mixNote}</p> : null}
            <p className="text-[12px] text-[color:var(--muted)] mt-4 mb-0">
              {creatorT(locale, 'creator.music.xb002')}
            </p>
            <p className="text-[12px] text-[color:var(--accent)] mt-2 mb-0">
              {creatorT(locale, 'creator.music.voiceBlocked')}
            </p>
            {note ? <p className="text-[12px] text-[color:var(--muted)] mt-3 mb-0">{note}</p> : null}
            {previewNote ? (
              <p className="text-[12px] text-[color:var(--muted)] mt-2 mb-0">{previewNote}</p>
            ) : null}
            {error ? (
              <p className="text-[13px] text-[color:var(--accent)] mt-3 mb-0" role="alert">
                {error}
              </p>
            ) : null}
          </>
        ) : null}
      </Card>
    </div>
  );
}
