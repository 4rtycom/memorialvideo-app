import React from 'react';
import { AbsoluteFill } from 'remotion';

import { resolveTheme, videoSafe, type ThemeTokens } from './theme';

type SafeTypeProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: 'start' | 'center';
  theme?: ThemeTokens;
};

export function SafeType({
  eyebrow,
  title,
  subtitle,
  align = 'center',
  theme = resolveTheme('timeless'),
}: SafeTypeProps) {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.background,
        color: theme.ink,
        padding: `${videoSafe.paddingY}px ${videoSafe.paddingX}px`,
        justifyContent: 'center',
        alignItems: align === 'center' ? 'center' : 'flex-start',
        textAlign: align === 'center' ? 'center' : 'left',
      }}
    >
      {eyebrow ? (
        <div
          style={{
            fontFamily: theme.titleFamily,
            fontSize: 28,
            letterSpacing: theme.letterSpacing,
            textTransform: 'uppercase',
            color: theme.accent,
            marginBottom: 28,
          }}
        >
          {eyebrow}
        </div>
      ) : null}
      <div
        style={{
          fontFamily: theme.titleFamily,
          fontSize: title.length > 28 ? theme.titleSize - 20 : theme.titleSize,
          lineHeight: 1.08,
          fontWeight: 400,
          maxWidth: 1480,
        }}
      >
        {title}
      </div>
      {subtitle ? (
        <div
          style={{
            marginTop: 28,
            fontFamily: theme.bodyFamily,
            fontSize: 32,
            color: theme.muted,
            maxWidth: 1100,
          }}
        >
          {subtitle}
        </div>
      ) : null}
    </AbsoluteFill>
  );
}
