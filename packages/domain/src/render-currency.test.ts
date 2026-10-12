import { describe, expect, it } from 'vitest';

import { parseTimelineContract } from '@memorialvideo/contracts';

import { formatOutputAspect, isRenderCurrentForPublishedTimeline } from './render-currency';
import { resolveRenderProvider, renderProviderCapabilities } from './render-provider';
import { canCreateFinalViewShare, shareAllowsComments, shareAllowsSignedPlayback } from './shares';

function sampleTimeline(themeKey: 'timeless' | 'warm_light' = 'timeless') {
  return parseTimelineContract({
    schemaVersion: 1,
    fps: 30,
    width: 1920,
    height: 1080,
    seed: 1,
    locale: 'en',
    themeKey,
    watermark: true,
    displayName: 'Alex',
    scenes: [
      {
        id: 'intro',
        type: 'intro',
        durationFrames: 90,
        transitionIn: 'fade',
        transitionOut: 'fade',
        displayName: 'Alex',
      },
      {
        id: 'outro',
        type: 'outro',
        durationFrames: 90,
        transitionIn: 'fade',
        transitionOut: 'fade',
        closingLine: 'Alex',
      },
    ],
  });
}

describe('render currency + provider', () => {
  it('detects when a READY final no longer matches the published film', () => {
    const published = sampleTimeline('timeless');
    const ready = sampleTimeline('timeless');
    expect(
      isRenderCurrentForPublishedTimeline({ publishedTimeline: published, renderTimeline: ready }),
    ).toBe(true);
    expect(
      isRenderCurrentForPublishedTimeline({
        publishedTimeline: sampleTimeline('warm_light'),
        renderTimeline: ready,
      }),
    ).toBe(false);
    expect(formatOutputAspect(1920, 1080)).toBe('16:9');
    expect(formatOutputAspect(1080, 1920)).toBe('9:16');
  });

  it('keeps render provider selection explicit and off the Vercel request path', () => {
    expect(resolveRenderProvider(undefined)).toBe('local');
    expect(resolveRenderProvider('remotion_lambda')).toBe('remotion_lambda');
    expect(renderProviderCapabilities('local').runsInsideVercelRequest).toBe(false);
    expect(renderProviderCapabilities('remotion_lambda').regionConfigurable).toBe(true);
  });

  it('gates private screening shares on entitlement and a READY final', () => {
    expect(canCreateFinalViewShare({ allowsPrivatePlayback: true, hasReadyFinal: true })).toBe(true);
    expect(canCreateFinalViewShare({ allowsPrivatePlayback: false, hasReadyFinal: true })).toBe(false);
    expect(canCreateFinalViewShare({ allowsPrivatePlayback: true, hasReadyFinal: false })).toBe(false);
    expect(shareAllowsComments('approval')).toBe(true);
    expect(shareAllowsComments('final_view')).toBe(false);
    expect(shareAllowsSignedPlayback('final_view')).toBe(true);
  });
});
