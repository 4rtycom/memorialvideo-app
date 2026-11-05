'use client';

import { Player, type PlayerRef } from '@remotion/player';
import type { TimelineContract } from '@memorialvideo/contracts';
import { MemorialComposition } from '@memorialvideo/video/composition';
import type { RefObject } from 'react';

export function RemotionCinemaPlayerInner({
  timeline,
  durationInFrames,
  playerRef,
}: {
  timeline: TimelineContract;
  durationInFrames: number;
  playerRef?: RefObject<PlayerRef | null>;
}) {
  return (
    <Player
      ref={playerRef}
      component={MemorialComposition}
      inputProps={timeline}
      durationInFrames={durationInFrames}
      compositionWidth={timeline.width}
      compositionHeight={timeline.height}
      fps={timeline.fps}
      style={{
        width: '100%',
        aspectRatio: `${timeline.width} / ${timeline.height}`,
        background: '#101b21',
      }}
      controls
      autoPlay={false}
      acknowledgeRemotionLicense
      errorFallback={() => (
        <p className="text-white p-6 m-0" role="alert">
          Preview failed to load. Your film is still saved.
        </p>
      )}
    />
  );
}
