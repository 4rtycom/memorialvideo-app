import { describe, expect, it } from 'vitest';

import { ENHANCEMENT_LOCAL_ENGINE, enhancementOperationSchema } from '@memorialvideo/contracts';

import {
  applyEnhancementPipeline,
  encodeEnhancedJpeg,
  validateEnhancedOutput,
} from './enhancement';
import { encodeJpeg } from './jpeg-codec';
import type { RgbaImage } from './pixels';

function fadedFixture(): RgbaImage {
  const width = 64;
  const height = 48;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = 170 + (x % 20);
      data[offset + 1] = 150 + (y % 15);
      data[offset + 2] = 130;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}

function gentleOps() {
  const base = {
    implementationMethod: 'deterministic' as const,
    maySynthesiseDetail: false,
    provider: ENHANCEMENT_LOCAL_ENGINE.name,
    version: ENHANCEMENT_LOCAL_ENGINE.version,
  };
  return [
    enhancementOperationSchema.parse({ ...base, kind: 'white_balance.correct', strength: 0.45 }),
    enhancementOperationSchema.parse({ ...base, kind: 'exposure.adjust', strength: 0.55 }),
    enhancementOperationSchema.parse({ ...base, kind: 'contrast.adjust', strength: 0.55 }),
  ];
}

describe('deterministic photo enhancement', () => {
  it('applies gentle correction without claiming AI', () => {
    const ops = gentleOps();
    expect(ops.every((op) => op.implementationMethod === 'deterministic')).toBe(true);
    expect(ops.every((op) => op.provider === ENHANCEMENT_LOCAL_ENGINE.name)).toBe(true);
    const result = applyEnhancementPipeline(fadedFixture(), ops);
    expect(result.applied.length).toBe(ops.length);
    expect(result.image.width).toBe(64);
    const bytes = encodeEnhancedJpeg(result.image, 'preview');
    const report = validateEnhancedOutput({ bytes, expectedWidth: 64, expectedHeight: 48 });
    expect(report.decodeOk).toBe(true);
    expect(report.renderCompatible).toBe(true);
  });

  it('labels resize as resampling not AI upscale', () => {
    const op = enhancementOperationSchema.parse({
      kind: 'upscale',
      strength: 1,
      parameters: { maxWidth: 128, maxHeight: 96, scale: 2 },
      implementationMethod: 'deterministic',
      maySynthesiseDetail: false,
      provider: ENHANCEMENT_LOCAL_ENGINE.name,
      version: ENHANCEMENT_LOCAL_ENGINE.version,
      warnings: ['resampling_not_ai_super_resolution'],
    });
    const result = applyEnhancementPipeline(fadedFixture(), [op]);
    expect(result.image.width).toBe(128);
    expect(result.image.height).toBe(96);
    expect(op.warnings).toContain('resampling_not_ai_super_resolution');
  });

  it('skips model-based ops instead of inventing detail', () => {
    const op = enhancementOperationSchema.parse({
      kind: 'face_detail.enhance',
      strength: 0.5,
      implementationMethod: 'model_based',
      maySynthesiseDetail: true,
      provider: 'none',
      version: 'blocked',
    });
    const result = applyEnhancementPipeline(fadedFixture(), [op]);
    expect(result.applied).toHaveLength(0);
    expect(result.skipped[0]).toContain('model_based_unavailable');
  });

  it('rejects invalid strength and validates jpeg output', () => {
    expect(() =>
      applyEnhancementPipeline(fadedFixture(), [
        enhancementOperationSchema.parse({
          kind: 'exposure.adjust',
          strength: 1.5,
          implementationMethod: 'deterministic',
          provider: ENHANCEMENT_LOCAL_ENGINE.name,
          version: ENHANCEMENT_LOCAL_ENGINE.version,
        }),
      ]),
    ).toThrow();
    const jpeg = encodeJpeg(fadedFixture(), 80);
    expect(validateEnhancedOutput({ bytes: jpeg }).decodeOk).toBe(true);
  });
});
