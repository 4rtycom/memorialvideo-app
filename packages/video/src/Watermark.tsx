import React from 'react';
import { AbsoluteFill } from 'remotion';

import { resolveTheme, type ThemeTokens } from './theme';

export function Watermark({ theme = resolveTheme('timeless') }: { theme?: ThemeTokens }) {
  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'flex-end',
        padding: 56,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          fontFamily: theme.bodyFamily,
          fontSize: 22,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: theme.watermark,
        }}
      >
        Preview — MemorialVideo
      </div>
    </AbsoluteFill>
  );
}
