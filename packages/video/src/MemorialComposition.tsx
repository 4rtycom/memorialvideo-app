import type { LaunchLanguage, TimelineContract, Transition } from '@memorialvideo/contracts';
import { totalDurationFrames } from '@memorialvideo/contracts';
import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';

import { AudioMixLayer, speechSceneIds } from './AudioMixLayer';
import { FilmGrain } from './FilmGrain';
import { MediaScene } from './MediaScene';
import { sceneSeed } from './motion';
import { SafeType } from './SafeType';
import { resolveTheme } from './theme';
import { transitionOpacity } from './transitions';
import { Watermark } from './Watermark';

const REMEMBRANCE: Record<LaunchLanguage, string> = {
  en: 'In remembrance',
  nl: 'Ter herinnering',
  de: 'In stillem Gedenken',
  fr: 'En souvenir',
  es: 'En recuerdo',
  pt: 'Em memória',
  it: 'In ricordo',
  pl: 'Ku pamięci',
};

function SceneArrive({ transitionIn, children }: { transitionIn: Transition; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ opacity: transitionOpacity(frame, transitionIn) }}>{children}</AbsoluteFill>;
}

export function MemorialComposition(props: TimelineContract) {
  let cursor = 0;
  const theme = resolveTheme(props.themeKey);
  const remembrance = REMEMBRANCE[props.locale];
  const speechIds = speechSceneIds(props.audio);
  const useMix = Boolean(props.audio && props.audio.tracks.length > 0);

  return (
    <AbsoluteFill style={{ backgroundColor: theme.background }}>
      {!useMix && props.music ? <Audio src={staticFile(props.music.src)} /> : null}
      {useMix ? <AudioMixLayer timeline={props} /> : null}
      {props.scenes.map((scene) => {
        const from = cursor;
        cursor += scene.durationFrames;
        return (
          <Sequence key={scene.id} from={from} durationInFrames={scene.durationFrames}>
            <SceneArrive transitionIn={scene.transitionIn}>
              {scene.type === 'intro' ? (
                <SafeType
                  theme={theme}
                  eyebrow={remembrance}
                  title={scene.displayName}
                  subtitle={scene.lifeSpanLabel}
                />
              ) : null}
              {scene.type === 'chapter' ? <SafeType theme={theme} title={scene.title} /> : null}
              {scene.type === 'image' ? (
                <MediaScene
                  theme={theme}
                  kind="image"
                  src={scene.asset.src}
                  caption={scene.caption}
                  focalX={scene.crop?.focalX}
                  focalY={scene.crop?.focalY}
                  zoom={scene.crop?.zoom}
                  motionSeed={sceneSeed(props.seed, scene.id)}
                />
              ) : null}
              {scene.type === 'video' ? (
                <MediaScene
                  theme={theme}
                  kind="video"
                  src={scene.asset.src}
                  caption={scene.caption}
                  playSpeech={speechIds.has(scene.id)}
                />
              ) : null}
              {scene.type === 'quote' ? (
                <SafeType theme={theme} title={`“${scene.text}”`} subtitle={scene.attribution} />
              ) : null}
              {scene.type === 'outro' ? (
                <SafeType theme={theme} eyebrow="MemorialVideo" title={scene.closingLine} />
              ) : null}
            </SceneArrive>
          </Sequence>
        );
      })}
      <FilmGrain theme={theme} />
      {props.watermark ? <Watermark theme={theme} /> : null}
    </AbsoluteFill>
  );
}

export function compositionDuration(props: TimelineContract): number {
  return totalDurationFrames(props);
}
