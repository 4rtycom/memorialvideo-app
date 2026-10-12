import { describe, expect, it } from 'vitest';

import { audioQualityObservations, imageQualityObservations, videoQualityObservations } from './quality-metrics';

describe('quality severity mapping', () => {
  it('keeps image quality as suggestions, never unusable labels', () => {
    const observations = imageQualityObservations({ width: 400, height: 300, luma: 10, sharpness: 5 });
    expect(observations.every((item) => item.severity === 'suggestion' || item.severity === 'information')).toBe(true);
    expect(observations.map((item) => item.code)).toEqual(
      expect.arrayContaining(['low_resolution', 'soft_focus', 'dark_exposure']),
    );
  });

  it('records missing audio as information, not a defect', () => {
    const observations = videoQualityObservations({
      width: 1280,
      height: 720,
      durationMs: 4000,
      hasAudio: false,
    });
    expect(observations.find((item) => item.code === 'missing_audio')?.severity).toBe('information');
  });

  it('records near-silence as information', () => {
    expect(audioQualityObservations({ peak: 0.01, rms: 0.001 })[0]).toMatchObject({
      code: 'near_silence',
      severity: 'information',
    });
  });
});
