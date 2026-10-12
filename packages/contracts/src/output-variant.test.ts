import { describe, expect, it } from 'vitest';

import {
  aspectFromDimensions,
  buildOutputVariantSpec,
  defaultAspectForVariantKind,
  parseOutputVariantSpec,
  VARIANT_DURATION_CAPS,
} from './output-variant';

describe('output variant contract', () => {
  it('maps kinds to default aspects and 1080-class frames', () => {
    expect(defaultAspectForVariantKind('full')).toBe('16:9');
    expect(defaultAspectForVariantKind('vertical')).toBe('9:16');
    expect(defaultAspectForVariantKind('square')).toBe('1:1');
    const vertical = buildOutputVariantSpec({
      id: 'ov_vertical_1',
      kind: 'vertical',
      baseTimelineHash: 'abcdefgh',
    });
    expect(vertical.width).toBe(1080);
    expect(vertical.height).toBe(1920);
    expect(vertical.sameProject).toBe(true);
  });

  it('caps ceremony and social shorts and marks silent captioned', () => {
    const ceremony = buildOutputVariantSpec({
      id: 'ov_ceremony_1',
      kind: 'ceremony_short',
      baseTimelineHash: 'abcdefgh',
    });
    expect(ceremony.durationCapFrames).toBe(VARIANT_DURATION_CAPS.ceremony_short);
    expect(ceremony.aspect).toBe('16:9');

    const silent = buildOutputVariantSpec({
      id: 'ov_silent_1',
      kind: 'silent_captioned',
      baseTimelineHash: 'abcdefgh',
    });
    expect(silent.silent).toBe(true);
    expect(silent.captionsPreferred).toBe(true);
  });

  it('rejects disconnected duplicate project forks in the schema', () => {
    expect(() =>
      parseOutputVariantSpec({
        schemaVersion: 1,
        id: 'ov_bad',
        kind: 'full',
        aspect: '16:9',
        width: 1920,
        height: 1080,
        baseTimelineHash: 'abcdefgh',
        sameProject: false,
        provenance: { provider: 'x', model: 'y', version: 'z' },
      }),
    ).toThrow();
  });

  it('round-trips aspect from dimensions', () => {
    expect(aspectFromDimensions(1920, 1080)).toBe('16:9');
    expect(aspectFromDimensions(1080, 1920)).toBe('9:16');
    expect(aspectFromDimensions(1080, 1080)).toBe('1:1');
    expect(aspectFromDimensions(1280, 720)).toBeNull();
  });
});
