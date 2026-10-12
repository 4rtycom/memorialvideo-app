import type { AudioMixContract, TimelineContract } from '@memorialvideo/contracts';
import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';

function resolveSrc(src: string): string {
  if (src.startsWith('http') || src.startsWith('data:') || src.startsWith('blob:')) {
    return src;
  }
  return staticFile(src);
}

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

/** Preview == render: music volume from ducking regions with attack/release. */
export function musicVolumeAtFrame(mix: AudioMixContract, frame: number, baseGainDb = 0): number {
  const baseLinear = dbToLinear(baseGainDb);
  if (!mix.ducking.enabled || mix.ducking.regions.length === 0) {
    return baseLinear;
  }
  const attack = mix.ducking.attackFrames;
  const release = mix.ducking.releaseFrames;
  let targetDb = 0;
  for (const region of mix.ducking.regions) {
    const duckStart = region.startFrame;
    const duckEnd = region.endFrame;
    if (frame < duckStart - attack || frame > duckEnd + release) {
      continue;
    }
    if (frame >= duckStart && frame <= duckEnd) {
      targetDb = Math.min(targetDb, region.musicGainDb);
      continue;
    }
    if (frame < duckStart && attack > 0) {
      const t = (duckStart - frame) / attack;
      targetDb = Math.min(targetDb, region.musicGainDb * (1 - t));
      continue;
    }
    if (frame > duckEnd && release > 0) {
      const t = (frame - duckEnd) / release;
      targetDb = Math.min(targetDb, region.musicGainDb * (1 - t));
    }
  }
  return baseLinear * dbToLinear(targetDb);
}

function MusicClip({
  mix,
  src,
  startFrame,
  durationFrames,
  gainDb,
}: {
  mix: AudioMixContract;
  src: string;
  startFrame: number;
  durationFrames: number;
  gainDb: number;
}) {
  return (
    <Sequence from={startFrame} durationInFrames={durationFrames} layout="none">
      <Audio
        src={resolveSrc(src)}
        volume={(frame) => musicVolumeAtFrame(mix, startFrame + frame, gainDb)}
      />
    </Sequence>
  );
}

function SubtitleBurnIn({ mix }: { mix: AudioMixContract }) {
  const frame = useCurrentFrame();
  const attached = mix.subtitles.filter((track) => track.attached && track.burnIn);
  const cues = attached.flatMap((track) => track.cues);
  const active = cues.filter((cue) => frame >= cue.startFrame && frame < cue.endFrame);
  if (active.length === 0) {
    return null;
  }
  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 96,
        pointerEvents: 'none',
      }}
    >
      {active.map((cue) => (
        <div
          key={cue.id}
          style={{
            maxWidth: '80%',
            backgroundColor: 'rgba(0,0,0,0.55)',
            color: '#f7f4ef',
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: 36,
            lineHeight: 1.35,
            padding: '12px 20px',
            textAlign: 'center',
          }}
        >
          {cue.text}
        </div>
      ))}
    </AbsoluteFill>
  );
}

/** Renders multitrack mix: music (ducked), narration, burn-in subtitles. Speech rides on unmuted video. */
export function AudioMixLayer({ timeline }: { timeline: TimelineContract }) {
  const mix = timeline.audio;
  if (!mix) {
    return null;
  }

  return (
    <>
      {mix.tracks
        .filter((track) => !track.muted && track.kind === 'music')
        .flatMap((track) =>
          track.clips.map((clip) => (
            <MusicClip
              key={`${track.id}:${clip.id}`}
              mix={mix}
              src={clip.src}
              startFrame={clip.startFrame}
              durationFrames={clip.durationFrames}
              gainDb={clip.gainDb + track.gainDb}
            />
          )),
        )}
      {mix.tracks
        .filter((track) => !track.muted && track.kind === 'narration')
        .flatMap((track) =>
          track.clips.map((clip) => (
            <Sequence
              key={`${track.id}:${clip.id}`}
              from={clip.startFrame}
              durationInFrames={clip.durationFrames}
              layout="none"
            >
              <Audio src={resolveSrc(clip.src)} volume={dbToLinear(clip.gainDb + track.gainDb)} />
            </Sequence>
          )),
        )}
      <SubtitleBurnIn mix={mix} />
    </>
  );
}

export function speechSceneIds(mix: AudioMixContract | undefined): Set<string> {
  const ids = new Set<string>();
  if (!mix) {
    return ids;
  }
  for (const track of mix.tracks) {
    if (track.muted || track.kind !== 'speech') {
      continue;
    }
    for (const clip of track.clips) {
      if (clip.sourceSceneId) {
        ids.add(clip.sourceSceneId);
      }
    }
  }
  return ids;
}
