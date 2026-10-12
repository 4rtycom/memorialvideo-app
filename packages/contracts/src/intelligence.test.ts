import { describe, expect, it } from 'vitest';

import {
  assetAnalysisSchema,
  directorBriefSchema,
  enhancementVariantSchema,
  isConfirmedInference,
  personClusterSchema,
  storyConflictSchema,
  storyFactSchema,
  timelinePatchSchema,
} from './intelligence';

const provenance = { provider: 'local', model: 'heuristic', version: 'v0' };

describe('intelligence contracts', () => {
  it('keeps EXIF dates as unconfirmed candidates, not biography', () => {
    const parsed = assetAnalysisSchema.parse({
      schemaVersion: 1,
      analysisId: 'an-1',
      assetId: 'asset-1',
      pipelineStatus: 'ready',
      sourceChecksum: 'a'.repeat(64),
      media: { mediaKind: 'photo', mime: 'image/jpeg', width: 1200, height: 800 },
      candidates: [
        {
          kind: 'captured_at',
          value: '2020-01-15T14:30:00',
          source: 'exif',
          status: 'uncertain',
          method: 'exif-datetime-original',
          confidence: 0.7,
        },
      ],
      quality: [
        {
          code: 'soft_focus',
          severity: 'suggestion',
          method: 'laplacian-variance',
          confidence: 0.6,
        },
      ],
      confidence: 0.7,
      provenance,
    });
    expect(parsed.candidates[0]?.status).toBe('uncertain');
    expect(isConfirmedInference(parsed.candidates[0]?.status ?? 'uncertain')).toBe(false);
    expect(parsed.correctionState).toBe('unreviewed');
    expect(parsed.media.mediaKind).toBe('photo');
  });

  it('discriminates video and audio media without unused photo fields', () => {
    const video = assetAnalysisSchema.parse({
      schemaVersion: 1,
      analysisId: 'an-v',
      assetId: 'asset-v',
      pipelineStatus: 'ready',
      sourceChecksum: 'c'.repeat(64),
      media: { mediaKind: 'video', durationMs: 2400, hasAudio: false, codec: 'avc1' },
      confidence: 0.8,
      provenance,
    });
    expect(video.media.mediaKind).toBe('video');
    expect('orientation' in video.media).toBe(false);
    const audio = assetAnalysisSchema.parse({
      schemaVersion: 1,
      analysisId: 'an-a',
      assetId: 'asset-a',
      pipelineStatus: 'ready',
      sourceChecksum: 'd'.repeat(64),
      media: { mediaKind: 'audio', durationMs: 1000, channels: 1, sampleRate: 8000 },
      confidence: 0.7,
      provenance,
    });
    expect(audio.media.mediaKind).toBe('audio');
    expect('width' in audio.media).toBe(false);
  });

  it('requires an explicit reason for unsupported media', () => {
    expect(() =>
      assetAnalysisSchema.parse({
        schemaVersion: 1,
        analysisId: 'an-2',
        assetId: 'asset-2',
        pipelineStatus: 'partial',
        sourceChecksum: 'b'.repeat(64),
        media: { mediaKind: 'unsupported' },
        confidence: 0.2,
        provenance,
      }),
    ).toThrow();
  });

  it('rejects a person cluster without consent when consent is required to be boolean', () => {
    expect(() =>
      personClusterSchema.parse({
        schemaVersion: 1,
        id: 'cluster-1',
        assetIds: ['asset-1'],
        confidence: 0.9,
        status: 'inferred',
        provenance,
      }),
    ).toThrow();
  });

  it('keeps family disagreement undecided by the model', () => {
    const conflict = storyConflictSchema.parse({
      schemaVersion: 1,
      id: 'conflict-1',
      factIds: ['fact-a', 'fact-b'],
      summary: 'Birth year differs between two captions.',
      provenance,
    });
    expect(conflict.decidedByFamily).toBe(false);
  });

  it('requires a reversible previewable timeline patch', () => {
    expect(() =>
      timelinePatchSchema.parse({
        schemaVersion: 1,
        id: 'patch-1',
        reversible: false,
        previewable: true,
        operations: [{ op: 'shorten', chapterId: 'c1' }],
        provenance,
      }),
    ).toThrow();
    const patch = timelinePatchSchema.parse({
      schemaVersion: 1,
      id: 'patch-1',
      reversible: true,
      previewable: true,
      operations: [{ op: 'shorten', chapterId: 'c1' }],
      provenance,
    });
    expect(patch.replacesManualEdits).toBe(false);
  });

  it('keeps originals immutable on enhancement variants', () => {
    const variant = enhancementVariantSchema.parse({
      schemaVersion: 1,
      id: 'enh-1',
      sourceAssetId: 'asset-1',
      kind: 'poster_still',
      reversible: true,
      originalImmutable: true,
      visibleAlteration: false,
      sourceMethod: 'h264_extract',
      provenance: { provider: 'remotion', model: 'renderStill', version: '4.0.518' },
    });
    expect(variant.originalImmutable).toBe(true);
  });

  it('accepts a natural-language director brief without applying it', () => {
    const brief = directorBriefSchema.parse({
      schemaVersion: 1,
      id: 'brief-1',
      naturalLanguage: 'Create a warm, dignified eight-minute memorial film focused on family.',
      targetDurationSeconds: 480,
      toneKeys: ['warm', 'dignified'],
    });
    expect(brief.replaceManualEdits).toBe(false);
  });

  it('rejects an unlabelled biographical claim missing status', () => {
    expect(() =>
      storyFactSchema.parse({
        schemaVersion: 1,
        id: 'fact-1',
        claim: 'Born in 1948',
        kind: 'date',
        confidence: 0.2,
        provenance,
      }),
    ).toThrow();
  });
});
