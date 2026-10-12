'use client';

import type { TimelineContract } from '@memorialvideo/contracts';
import { totalDurationFrames } from '@memorialvideo/contracts';
import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { absolutizeTimeline } from '@/lib/timeline-client';

const Inner = dynamic(() => import('./RemotionCinemaPlayerInner').then((m) => m.RemotionCinemaPlayerInner), {
  ssr: false,
  loading: () => (
    <div className="player mb-5">
      <div className="relative aspect-[1006/412] bg-[color:var(--cinema)] flex items-center justify-center text-white">
        Loading screening room…
      </div>
    </div>
  ),
});

export function RemotionCinemaPlayer({
  timeline,
  origin,
}: {
  timeline: TimelineContract | null;
  origin: string;
}) {
  const playerTimeline = useMemo(() => {
    if (!timeline) return null;
    return absolutizeTimeline(timeline, origin);
  }, [timeline, origin]);

  if (!playerTimeline) {
    return (
      <div className="player mb-5">
        <div className="relative aspect-[1006/412] bg-[color:var(--cinema)] flex items-center justify-center text-white px-6 text-center">
          Arrange the first film to open a TimelineContract-backed Remotion screening room.
        </div>
      </div>
    );
  }

  return (
    <div className="player mb-5">
      <Inner timeline={playerTimeline} durationInFrames={totalDurationFrames(playerTimeline)} />
      <div className="bg-[color:var(--cinema)] px-5 py-3 text-white/80 text-[12px]">
        Remotion Player · {playerTimeline.width}×{playerTimeline.height} · seed {playerTimeline.seed}
        {playerTimeline.watermark ? ' · draft watermark' : ''}
      </div>
    </div>
  );
}
