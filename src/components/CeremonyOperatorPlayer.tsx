'use client';

import type { TimelineContract } from '@memorialvideo/contracts';
import { formatTimelineClock, sceneStartFrame, totalDurationFrames } from '@memorialvideo/contracts';
import type { PlayerRef } from '@remotion/player';
import { useMemo, useRef, useState } from 'react';
import { RemotionCinemaPlayer } from '@/components/RemotionCinemaPlayer';
import { Button } from '@/components/ui';

/**
 * Operator-facing pause/resume for ceremony rehearsal.
 * Honest: this is manual control — not automatic speech-pause blocks in a venue ZIP.
 */
export function CeremonyOperatorPlayer({
  timeline,
  origin,
}: {
  timeline: TimelineContract | null;
  origin: string;
}) {
  const playerRef = useRef<PlayerRef>(null);
  const [paused, setPaused] = useState(true);
  const [note] = useState(
    'Pause for live words, then Resume when the room is ready. Automatic speech-pause markers are a follow-up — this control is manual.',
  );

  const chapters = useMemo(() => {
    if (!timeline) return [] as Array<{ id: string; title: string; startFrame: number; label: string }>;
    return timeline.scenes
      .filter((scene) => scene.type === 'chapter')
      .map((scene, index) => {
        const startFrame = sceneStartFrame(timeline, scene.id);
        return {
          id: scene.id,
          title: scene.type === 'chapter' ? scene.title : `Moment ${index + 1}`,
          startFrame,
          label: formatTimelineClock(startFrame, timeline.fps),
        };
      });
  }, [timeline]);

  if (!timeline) {
    return (
      <div className="card !p-6 mb-5" data-testid="ceremony-operator-empty">
        <h3 className="serif text-[28px] m-0 mb-2">Ceremony operator rehearsal</h3>
        <p className="text-[color:var(--muted)] m-0">
          Arrange the first film to rehearse pause and resume for the service.
        </p>
      </div>
    );
  }

  const total = formatTimelineClock(totalDurationFrames(timeline), timeline.fps);

  return (
    <div className="card !p-6 mb-5" data-testid="ceremony-operator-player">
      <h3 className="serif text-[28px] m-0 mb-2">Ceremony operator rehearsal</h3>
      <p className="text-[color:var(--muted)] mb-4">{note}</p>
      <RemotionCinemaPlayer timeline={timeline} origin={origin} playerRef={playerRef} />
      <div className="flex flex-wrap gap-3 mt-4 mb-4">
        <Button
          type="button"
          onClick={() => {
            playerRef.current?.pause();
            setPaused(true);
          }}
          variant={paused ? 'primary' : 'secondary'}
        >
          Pause for speech
        </Button>
        <Button
          type="button"
          onClick={() => {
            playerRef.current?.play();
            setPaused(false);
          }}
          variant={!paused ? 'primary' : 'secondary'}
        >
          Resume film
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            playerRef.current?.seekTo(0);
            playerRef.current?.pause();
            setPaused(true);
          }}
        >
          Restart from beginning
        </Button>
      </div>
      <p className="text-[13px] text-[color:var(--muted)] m-0 mb-3">Film length · {total}</p>
      {chapters.length > 0 ? (
        <ul className="list-none p-0 m-0 grid gap-2 text-[13px]">
          {chapters.map((chapter) => (
            <li key={chapter.id} className="flex flex-wrap items-center gap-3">
              <span className="text-[color:var(--muted)] min-w-[3.5rem]">{chapter.label}</span>
              <span>{chapter.title}</span>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  playerRef.current?.seekTo(chapter.startFrame);
                  playerRef.current?.pause();
                  setPaused(true);
                }}
              >
                Cue here
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-[color:var(--muted)] m-0">
          No chapter markers yet — pause anywhere during rehearsal.
        </p>
      )}
    </div>
  );
}
