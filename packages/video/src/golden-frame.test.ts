import { describe, expect, it } from 'vitest';

import { createThemeGoldenTimeline } from './timelines';
import {
  GOLDEN_COMPARE_FRAME,
  GOLDEN_THEME_KEYS,
  compareCandidatePngToGoldenProxy,
  compareGoldenFrameHash,
  encodeGoldenThemeProxyPng,
  goldenFrameStillPath,
  hashCommittedGoldenFrame,
  hashGoldenThemeProxyFrame,
  loadCommittedGoldenFramePng,
} from './golden-frame';

describe('golden frame compare prep', () => {
  it('locks the Remotion still index and seed on golden contracts', () => {
    expect(GOLDEN_COMPARE_FRAME).toBe(90);
    for (const theme of GOLDEN_THEME_KEYS) {
      const timeline = createThemeGoldenTimeline(theme, true);
      expect(timeline.seed).toBe(42);
      expect(timeline.themeKey).toBe(theme);
      expect(goldenFrameStillPath(theme)).toBe(`fixtures/golden-frames/${theme}-f090.png`);
    }
  });

  it('matches perceptual hashes for all five theme proxy stills', () => {
    for (const theme of GOLDEN_THEME_KEYS) {
      const hash = hashGoldenThemeProxyFrame(theme);
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
      const same = compareGoldenFrameHash({ theme, candidateHash: hash });
      expect(same).toEqual({ ok: true, distance: 0 });
    }
    const mismatch = compareGoldenFrameHash({
      theme: 'timeless',
      candidateHash: hashGoldenThemeProxyFrame('cinematic_dark'),
    });
    expect(mismatch.ok).toBe(false);
  });

  it('compares committed fixture PNGs against the proxy baseline', () => {
    for (const theme of GOLDEN_THEME_KEYS) {
      const committed = loadCommittedGoldenFramePng(theme);
      expect(committed.byteLength).toBeGreaterThan(100);
      expect(hashCommittedGoldenFrame(theme)).toBe(hashGoldenThemeProxyFrame(theme));
      const againstSelf = compareCandidatePngToGoldenProxy({
        theme,
        pngBytes: encodeGoldenThemeProxyPng(theme),
      });
      expect(againstSelf).toEqual({ ok: true, distance: 0 });
      const againstCommitted = compareCandidatePngToGoldenProxy({ theme, pngBytes: committed });
      expect(againstCommitted).toEqual({ ok: true, distance: 0 });
    }
  });
});
