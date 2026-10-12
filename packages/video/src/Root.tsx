import { parseTimelineContract, totalDurationFrames } from '@memorialvideo/contracts';
import React from 'react';
import { Composition } from 'remotion';

import { MemorialComposition } from './MemorialComposition';
import { PhoneClip } from './PhoneClip';
import { PosterExtract } from './PosterExtract';
import { createFullSpikeTimeline, createGoldenTimeline } from './timelines';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MemorialGolden"
        component={MemorialComposition}
        durationInFrames={totalDurationFrames(createGoldenTimeline(true))}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={createGoldenTimeline(true)}
        calculateMetadata={({ props }) => {
          const timeline = parseTimelineContract(props);
          return {
            durationInFrames: totalDurationFrames(timeline),
            width: timeline.width,
            height: timeline.height,
            props: timeline,
          };
        }}
      />
      <Composition
        id="PhoneClip"
        component={PhoneClip}
        durationInFrames={90}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="PosterExtract"
        component={PosterExtract}
        durationInFrames={1}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ src: '' }}
      />
      <Composition
        id="MemorialFull"
        component={MemorialComposition}
        durationInFrames={totalDurationFrames(createFullSpikeTimeline(false))}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={createFullSpikeTimeline(false)}
        calculateMetadata={({ props }) => {
          const timeline = parseTimelineContract(props);
          return {
            durationInFrames: totalDurationFrames(timeline),
            width: timeline.width,
            height: timeline.height,
            props: timeline,
          };
        }}
      />
    </>
  );
};
