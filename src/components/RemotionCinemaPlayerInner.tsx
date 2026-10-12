'use client';

import { Player } from '@remotion/player';
import type { TimelineContract } from '@memorialvideo/contracts';
import { MemorialComposition } from '@memorialvideo/video/composition';

export function RemotionCinemaPlayerInner({
  timeline,
  durationInFrames,
}: {
  timeline: TimelineContract;
  durationInFrames: number;
}) {
  return (
    <Player
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
          Preview failed to load. Your TimelineContract is still saved.
        </p>
      )}
    />
  );
}
