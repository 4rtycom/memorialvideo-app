'use client';

import type { TimelineContract } from '@memorialvideo/contracts';
import { totalDurationFrames } from '@memorialvideo/contracts';
import type { PlayerRef } from '@remotion/player';
import dynamic from 'next/dynamic';
import { useMemo, type RefObject } from 'react';
import { absolutizeTimeline } from '@/lib/timeline-client';

const Inner = dynamic(() => import('./RemotionCinemaPlayerInner').then((m) => m.RemotionCinemaPlayerInner), {
  ssr: false,
  loading: () => (
    <div className="player mb-5">
      <div className="relative aspect-[1006/412] bg-[color:var(--cinema)] flex items-center justify-center text-white">
        Loading your film…
      </div>
    </div>
  ),
});

export function RemotionCinemaPlayer({
  timeline,
  origin,
  playerRef,
}: {
  timeline: TimelineContract | null;
  origin: string;
  playerRef?: RefObject<PlayerRef | null>;
}) {
  const playerTimeline = useMemo(() => {
    if (!timeline) return null;
    return absolutizeTimeline(timeline, origin);
  }, [timeline, origin]);

  if (!playerTimeline) {
    return (
      <div className="player mb-5">
        <div className="relative aspect-[1006/412] bg-[color:var(--cinema)] flex items-center justify-center text-white px-6 text-center">
          Arrange the first film to open the screening room.
        </div>
      </div>
    );
  }

  return (
    <div className="player mb-5">
      <Inner
        timeline={playerTimeline}
        durationInFrames={totalDurationFrames(playerTimeline)}
        playerRef={playerRef}
      />
      <div className="bg-[color:var(--cinema)] px-5 py-3 text-white/80 text-[12px]">
        Your film · {playerTimeline.width}×{playerTimeline.height}
        {playerTimeline.watermark ? ' · draft preview' : ''}
      </div>
    </div>
  );
}
