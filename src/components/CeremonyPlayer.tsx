'use client';

import type {
  CeremonySpeechPause,
  LaunchLanguage,
  TimelineContract,
} from '@memorialvideo/contracts';
import {
  formatTimelineClock,
  totalDurationFrames,
} from '@memorialvideo/contracts';
import {
  buildCeremonyRunningOrder,
  nextAutoPauseFrame,
  type CeremonyRunningOrderItem,
} from '@memorialvideo/domain/ceremony-player';
import type { PlayerRef } from '@remotion/player';
import { useEffect, useMemo, useRef, useState } from 'react';
import { RemotionCinemaPlayer } from '@/components/RemotionCinemaPlayer';
import { Button } from '@/components/ui';
import { ceremonyButtonEmphasis } from '@/lib/ceremony-emphasis';
import { creatorT } from '@/lib/creator-ui-messages';

type HoldState =
  | { active: false }
  | { active: true; title: string; note: string; cueId: string | null };

/**
 * Interactive Ceremony Player (Gate B / MV-AUD-004 stretch).
 * Dual surface: projection display + separate operator controls.
 * Auto-holds at Music Director speech pauses; operator resumes for live words.
 */
export function CeremonyPlayer({
  timeline,
  origin,
  speechPauses = [],
  compact = false,
  locale = 'en',
}: {
  locale?: LaunchLanguage;
  timeline: TimelineContract | null;
  origin: string;
  speechPauses?: readonly CeremonySpeechPause[] | null;
  /** Embed on /share without the full dual-column layout. */
  compact?: boolean;
}) {
  const playerRef = useRef<PlayerRef>(null);
  const displayRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(0);
  const [hold, setHold] = useState<HoldState>({ active: false });
  /** Frames already consumed for auto-pause so we do not re-trigger on resume. */
  const clearedAutoPauseRef = useRef<number>(-1);
  /** Latest keyboard handler; the document listener below always calls the current one. */
  const keyHandlerRef = useRef<((event: KeyboardEvent) => void) | null>(null);

  useEffect(() => {
    function onDocumentKeyDown(event: KeyboardEvent) {
      keyHandlerRef.current?.(event);
    }
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => document.removeEventListener('keydown', onDocumentKeyDown);
  }, []);

  const order = useMemo(() => {
    if (!timeline) return [] as CeremonyRunningOrderItem[];
    return buildCeremonyRunningOrder({ timeline, speechPauses });
  }, [timeline, speechPauses]);

  const speechCues = useMemo(
    () => order.filter((item) => item.kind === 'speech_pause'),
    [order],
  );

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !timeline) return;

    const onFrame = () => {
      const current = player.getCurrentFrame();
      setFrame(current);
      if (hold.active) return;
      if (!player.isPlaying()) return;
      const target = nextAutoPauseFrame(order, clearedAutoPauseRef.current);
      if (target === null) return;
      if (current >= target) {
        player.pause();
        setPlaying(false);
        clearedAutoPauseRef.current = target;
        const cue = order.find((item) => item.autoPause && item.startFrame === target);
        setHold({
          active: true,
          title: cue?.title ?? 'Waiting for live words',
          note: cue?.waitingNote || 'Press Resume film when the room is ready.',
          cueId: cue?.id ?? null,
        });
        player.seekTo(target);
        setFrame(target);
      }
    };

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    player.addEventListener('frameupdate', onFrame);
    player.addEventListener('play', onPlay);
    player.addEventListener('pause', onPause);
    return () => {
      player.removeEventListener('frameupdate', onFrame);
      player.removeEventListener('play', onPlay);
      player.removeEventListener('pause', onPause);
    };
  }, [timeline, order, hold.active]);

  if (!timeline) {
    return (
      <div className="card !p-6 mb-5" data-testid="ceremony-player-empty">
        <h3 className="serif text-[28px] m-0 mb-2">{creatorT(locale, 'creator.film.ceremonyTitle')}</h3>
        <p className="text-[color:var(--muted)] m-0">{creatorT(locale, 'creator.film.ceremonyEmpty')}</p>
      </div>
    );
  }

  const totalFrames = totalDurationFrames(timeline);
  const total = formatTimelineClock(totalFrames, timeline.fps);
  const clock = formatTimelineClock(frame, timeline.fps);
  const fps = timeline.fps;
  const emphasis = ceremonyButtonEmphasis({ playing, holdActive: hold.active });

  function pauseForSpeech(manual = true) {
    playerRef.current?.pause();
    setPlaying(false);
    if (manual) {
      setHold({
        active: true,
        title: creatorT(locale, 'creator.ceremony.holdTitle'),
        note: creatorT(locale, 'creator.ceremony.holdNote'),
        cueId: null,
      });
    }
  }

  function resumeFilm() {
    if (hold.active && hold.cueId) {
      const cue = order.find((item) => item.id === hold.cueId);
      if (cue) clearedAutoPauseRef.current = cue.startFrame;
    }
    setHold({ active: false });
    playerRef.current?.play();
    setPlaying(true);
  }

  function seekRelative(seconds: number) {
    const player = playerRef.current;
    if (!player) return;
    const next = Math.max(
      0,
      Math.min(totalFrames - 1, player.getCurrentFrame() + Math.round(seconds * fps)),
    );
    player.seekTo(next);
    setFrame(next);
  }

  function cueTo(item: CeremonyRunningOrderItem) {
    playerRef.current?.seekTo(item.startFrame);
    playerRef.current?.pause();
    setPlaying(false);
    setFrame(item.startFrame);
    if (item.autoPause) {
      clearedAutoPauseRef.current = item.startFrame;
      setHold({
        active: true,
        title: item.title,
        note: item.waitingNote || creatorT(locale, 'creator.ceremony.cuedNote'),
        cueId: item.id,
      });
    } else {
      setHold({ active: false });
    }
  }

  async function toggleFullscreen() {
    const node = displayRef.current;
    if (!node) return;
    try {
      if (!document.fullscreenElement) {
        await node.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fullscreen may be blocked on some venue browsers — operator can still use the panel.
    }
  }

  keyHandlerRef.current = (event: KeyboardEvent) => {
    // Never fight the browser or assistive tech: skip shortcut combos and form fields.
    if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
    ) {
      return;
    }
    const onControl = Boolean(target?.closest('button, a, [role="button"], [role="tab"]'));
    // Space activates a focused control natively — only take it when focus is elsewhere.
    if ((event.key === ' ' && !onControl) || event.key === 'k' || event.key === 'K') {
      event.preventDefault();
      if (hold.active || !playing) resumeFilm();
      else pauseForSpeech(true);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      seekRelative(-10);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      seekRelative(10);
    }
  };

  const display = (
    <div
      ref={displayRef}
      className="relative bg-[color:var(--cinema)] rounded-[14px] overflow-hidden"
      data-testid="ceremony-display"
    >
      <RemotionCinemaPlayer
        timeline={timeline}
        origin={origin}
        playerRef={playerRef}
        showControls={false}
        showMeta={false}
        className="player !mb-0 !rounded-none"
      />
      {hold.active ? (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center text-center px-8 bg-[color:rgba(16,27,33,0.72)]"
          role="status"
          aria-live="polite"
          data-testid="ceremony-speech-hold"
        >
          <p className="text-[12px] font-bold tracking-[0.08em] text-[color:var(--accent)] m-0 mb-3">
            {creatorT(locale, 'creator.ceremony.liveWords')}
          </p>
          <h2 className="serif text-white text-[clamp(1.5rem,4vw,2.75rem)] font-normal m-0 mb-3">
            {hold.title}
          </h2>
          <p className="text-white/75 text-[15px] m-0 max-w-[32rem]">{hold.note}</p>
        </div>
      ) : null}
    </div>
  );

  const controls = (
    <div
      data-testid="ceremony-operator-controls"
    >
      <p className="text-[12px] font-bold tracking-[0.08em] text-[color:var(--accent)] m-0 mb-2">
        {creatorT(locale, 'creator.ceremony.operator')}
      </p>
      <h3 className={`serif m-0 mb-2 ${compact ? 'text-[24px]' : 'text-[28px]'}`}>
        {creatorT(locale, 'creator.film.ceremonyTitle')}
      </h3>
      <p className="text-[color:var(--muted)] text-[14px] mb-4">
        {speechCues.length === 1
          ? creatorT(locale, 'creator.ceremony.cuesOne')
          : speechCues.length > 1
            ? creatorT(locale, 'creator.ceremony.cuesMany').replace('{count}', String(speechCues.length))
            : creatorT(locale, 'creator.ceremony.cuesNone')}
      </p>
      <p className="text-[14px] text-[color:var(--muted)] mb-4">
        {creatorT(locale, 'creator.ceremony.keyboardHint')}
      </p>
      <div className="flex flex-wrap gap-3 mb-4">
        <Button
          type="button"
          variant={emphasis.pause}
          onClick={() => pauseForSpeech(true)}
          aria-keyshortcuts="Space K"
        >
          {creatorT(locale, 'creator.ceremony.pause')}
        </Button>
        <Button type="button" variant={emphasis.resume} onClick={resumeFilm} aria-keyshortcuts="Space K">
          {creatorT(locale, 'creator.ceremony.resume')}
        </Button>
        <Button type="button" variant="ghost" onClick={() => seekRelative(-10)} aria-keyshortcuts="ArrowLeft">
          {creatorT(locale, 'creator.ceremony.back10')}
        </Button>
        <Button type="button" variant="ghost" onClick={() => seekRelative(10)} aria-keyshortcuts="ArrowRight">
          {creatorT(locale, 'creator.ceremony.skip10')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            playerRef.current?.seekTo(0);
            playerRef.current?.pause();
            setPlaying(false);
            setFrame(0);
            clearedAutoPauseRef.current = -1;
            setHold({ active: false });
          }}
        >
          {creatorT(locale, 'creator.ceremony.restart')}
        </Button>
        <Button type="button" variant="ghost" onClick={() => void toggleFullscreen()}>
          {creatorT(locale, 'creator.ceremony.fullscreen')}
        </Button>
      </div>
      <p className="text-[14px] text-[color:var(--muted)] m-0 mb-3">
        {clock} · {total}
        {` · ${
          hold.active
            ? creatorT(locale, 'creator.ceremony.statusHolding')
            : playing
              ? creatorT(locale, 'creator.ceremony.statusPlaying')
              : creatorT(locale, 'creator.ceremony.statusPaused')
        }`}
      </p>
      {order.length > 0 ? (
        <ul className="list-none p-0 m-0 grid gap-2 text-[14px]" data-testid="ceremony-running-order">
          {order.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3">
              <span className="text-[color:var(--muted)] min-w-[3.5rem]">{item.startLabel}</span>
              <span>
                {item.kind === 'speech_pause' ? (
                  <span className="text-[color:var(--accent)]">
                    {creatorT(locale, 'creator.ceremony.liveWordsInline')} ·{' '}
                  </span>
                ) : null}
                {item.title}
              </span>
              <Button type="button" variant="ghost" onClick={() => cueTo(item)}>
                {creatorT(locale, 'creator.ceremony.cueHere')}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-[color:var(--muted)] m-0">
          {creatorT(locale, 'creator.ceremony.noMarkers')}
        </p>
      )}
    </div>
  );

  if (compact) {
    return (
      <div className="card !p-6 mb-5" data-testid="ceremony-player">
        {controls}
        <div className="mt-4">{display}</div>
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.9fr)] mb-5" data-testid="ceremony-player">
      {display}
      <div className="card !p-6 self-start">{controls}</div>
    </div>
  );
}
