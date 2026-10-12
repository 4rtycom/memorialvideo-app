import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { timeless } from './theme';

export function PhoneClip() {
  const frame = useCurrentFrame();
  const drift = (frame % 90) / 90;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: timeless.ink,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          width: 720,
          height: 1280,
          backgroundColor: timeless.background,
          transform: `scale(${1 + drift * 0.02})`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 64,
        }}
      >
        <div
          style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: 48,
            color: timeless.ink,
            textAlign: 'center',
          }}
        >
          Synthetic family clip
        </div>
      </div>
    </AbsoluteFill>
  );
}
