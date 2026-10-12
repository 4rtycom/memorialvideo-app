'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import {
  formatTimelineClock,
  sceneIdAtFrame,
  totalDurationFrames,
  type TimelineContract,
} from '@memorialvideo/contracts';

/**
 * Cinema screening driven by a validated TimelineContract.
 * Frame clock uses rAF; seed/durations come from the contract (no Math.random).
 */
export function CinemaPlayer({
  timeline,
  fallbackStill = '/fixtures/film-still.png',
}: {
  timeline: TimelineContract | null;
  fallbackStill?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(0);

  const totalFrames = useMemo(
    () => (timeline ? totalDurationFrames(timeline) : 0),
    [timeline],
  );

  useEffect(() => {
    if (!playing || !timeline || totalFrames <= 0) {
      return;
    }
    let raf = 0;
    let last = performance.now();
    let current = frame;
    const tick = (now: number) => {
      const elapsed = now - last;
      const framesAdvance = Math.floor((elapsed / 1000) * timeline.fps);
      if (framesAdvance > 0) {
        last = now;
        current = Math.min(totalFrames - 1, current + framesAdvance);
        setFrame(current);
        if (current >= totalFrames - 1) {
          setPlaying(false);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, timeline, totalFrames]);

  if (!timeline) {
    return (
      <div className="player mb-5">
        <div className="relative aspect-[1006/412]">
          <Image src={fallbackStill} alt="" fill className="object-cover" sizes="1000px" priority />
          <div className="player-overlay">
            <div className="text-[11px] font-bold text-[color:var(--accent)] mb-1">DRAFT PREVIEW</div>
            <div className="serif text-[32px] text-white leading-none">Arrange the first film to open the screening room.</div>
          </div>
        </div>
      </div>
    );
  }

  const sceneId = sceneIdAtFrame(timeline, frame);
  const scene = timeline.scenes.find((s) => s.id === sceneId) ?? timeline.scenes[0];
  const still =
    scene?.type === 'image'
      ? scene.asset.src
      : fallbackStill;
  const overlayTitle =
    scene?.type === 'intro'
      ? scene.displayName
      : scene?.type === 'chapter'
        ? scene.title
        : scene?.type === 'quote'
          ? scene.text
          : scene?.type === 'outro'
            ? scene.closingLine
            : timeline.displayName;
  const progress = totalFrames > 0 ? Math.min(100, (frame / totalFrames) * 100) : 0;

  return (
    <div className="player mb-5">
      <div className="relative aspect-[1006/412]">
        <Image src={still} alt="" fill className="object-cover" sizes="1000px" priority />
        <button
          className="play-fab"
          type="button"
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => {
            if (frame >= totalFrames - 1) {
              setFrame(0);
            }
            setPlaying((value) => !value);
          }}
        >
          {playing ? 'Ⅱ' : '▷'}
        </button>
        <div className="player-overlay">
          <div className="text-[11px] font-bold text-[color:var(--accent)] mb-1">
            {timeline.watermark ? 'DRAFT PREVIEW' : 'IN LOVING MEMORY'}
          </div>
          <div className="serif text-[46px] text-white leading-none">{overlayTitle}</div>
        </div>
      </div>
      <div className="bg-[color:var(--cinema)] px-5 py-4 flex items-center gap-4 text-white text-[14px]">
        <span>{formatTimelineClock(frame, timeline.fps)}</span>
        <div className="progress flex-1 !bg-[color:var(--cinema-panel)]">
          <span style={{ width: `${progress}%` }} />
        </div>
        <span>{formatTimelineClock(totalFrames, timeline.fps)}</span>
        <span className="opacity-80">⛶   ♫   CC</span>
      </div>
    </div>
  );
}
