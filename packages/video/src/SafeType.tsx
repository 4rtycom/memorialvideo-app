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
  align,
  theme = resolveTheme('timeless'),
}: SafeTypeProps) {
  const resolvedAlign =
    align ??
    (theme.chapterTreatment === 'editorial'
      ? 'start'
      : theme.chapterTreatment === 'bold'
        ? 'center'
        : 'center');
  const titleSize =
    theme.chapterTreatment === 'bold'
      ? theme.titleSize + 4
      : theme.chapterTreatment === 'editorial'
        ? theme.titleSize - 4
        : theme.titleSize;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.background,
        color: theme.ink,
        padding: `${videoSafe.paddingY}px ${videoSafe.paddingX}px`,
        justifyContent: 'center',
        alignItems: resolvedAlign === 'center' ? 'center' : 'flex-start',
        textAlign: resolvedAlign === 'center' ? 'center' : 'left',
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
            fontWeight: theme.chapterTreatment === 'bold' ? 500 : 400,
          }}
        >
          {eyebrow}
        </div>
      ) : null}
      <div
        style={{
          fontFamily: theme.titleFamily,
          fontSize: title.length > 28 ? titleSize - 20 : titleSize,
          lineHeight: theme.chapterTreatment === 'bold' ? 1.02 : 1.08,
          fontWeight: theme.chapterTreatment === 'bold' ? 500 : 400,
          maxWidth: theme.chapterTreatment === 'editorial' ? 1280 : 1480,
          letterSpacing: theme.chapterTreatment === 'bold' ? theme.letterSpacing : undefined,
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
