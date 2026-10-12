import React from 'react';
import { AbsoluteFill, OffthreadVideo, staticFile } from 'remotion';

export type PosterExtractProps = {
  src: string;
};

export function posterExtractProps(src: string): PosterExtractProps {
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('file:')) {
    throw new Error('remote_src_denied');
  }
  return { src };
}

export function PosterExtract({ src }: PosterExtractProps) {
  if (!src || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('file:')) {
    return <AbsoluteFill style={{ backgroundColor: '#111111' }} />;
  }
  return (
    <AbsoluteFill style={{ backgroundColor: '#111111' }}>
      <OffthreadVideo src={staticFile(src)} muted style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
    </AbsoluteFill>
  );
}
