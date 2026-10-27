import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import type { ThemeTokens } from './theme';

/**
 * Soft procedural grain overlay — opacity from FilmStyleManifest.grainOpacity.
 * Seeded by frame so Player ↔ encode feel consistent without Math.random().
 */
export function FilmGrain({ theme }: { theme: ThemeTokens }) {
  const frame = useCurrentFrame();
  const opacity = Math.min(0.2, Math.max(0, theme.grainOpacity));
  if (opacity <= 0.001) {
    return null;
  }
  // Stable per-frame hash for SVG turbulence seed (0–9999).
  const seed = ((frame * 2654435761) >>> 0) % 10_000;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        opacity,
        mixBlendMode: theme.key === 'cinematic_dark' ? 'soft-light' : 'overlay',
      }}
    >
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <filter id={`mv-grain-${seed}`}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="2"
            seed={seed}
            stitchTiles="stitch"
          />
        </filter>
        <rect width="100%" height="100%" filter={`url(#mv-grain-${seed})`} />
      </svg>
    </AbsoluteFill>
  );
}
