import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

import { kenBurnsScale, kenBurnsShift } from './motion';
import { resolveTheme, videoSafe, type ThemeTokens } from './theme';

type MediaSceneProps = {
  src: string;
  kind: 'image' | 'video';
  caption?: string;
  focalX?: number;
  focalY?: number;
  zoom?: number;
  motionSeed?: number;
  theme?: ThemeTokens;
  /** When true, original clip speech is included in the mix (not muted). */
  playSpeech?: boolean;
};

export function MediaScene({
  src,
  kind,
  caption,
  focalX = 0.5,
  focalY = 0.5,
  zoom = 1,
  motionSeed = 1,
  theme = resolveTheme('timeless'),
  playSpeech = false,
}: MediaSceneProps) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const liveZoom =
    kind === 'image'
      ? kenBurnsScale(zoom, frame, durationInFrames, motionSeed, theme.motionIntensity)
      : zoom;
  const shift =
    kind === 'image'
      ? kenBurnsShift(frame, durationInFrames, motionSeed, theme.motionIntensity)
      : { x: 0, y: 0 };
  const resolved = src.startsWith('http') || src.startsWith('data:') || src.startsWith('blob:') ? src : staticFile(src);
  const inset = theme.imageTreatment === 'editorial' ? 48 : theme.imageTreatment === 'spotlight' ? 96 : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: theme.mediaMatte }}>
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          padding: inset,
          overflow: 'hidden',
        }}
      >
        {kind === 'image' ? (
          <Img
            src={resolved}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: `${focalX * 100}% ${focalY * 100}%`,
              transform: `translate(${shift.x}%, ${shift.y}%) scale(${liveZoom})`,
              transformOrigin: `${focalX * 100}% ${focalY * 100}%`,
              boxShadow: theme.imageTreatment === 'spotlight' ? '0 24px 80px rgba(0,0,0,0.45)' : undefined,
            }}
          />
        ) : (
          <OffthreadVideo
            src={resolved}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
            muted={!playSpeech}
            volume={playSpeech ? 1 : 0}
          />
        )}
      </AbsoluteFill>
      {caption ? (
        <div
          style={{
            position: 'absolute',
            left: videoSafe.paddingX,
            right: videoSafe.paddingX,
            bottom: 72,
            color: theme.key === 'cinematic_dark' ? theme.ink : theme.paper,
            fontFamily: theme.titleFamily,
            fontSize: 34,
            textShadow: '0 2px 16px rgba(0,0,0,0.45)',
          }}
        >
          {caption}
        </div>
      ) : null}
    </AbsoluteFill>
  );
}
