import { describe, expect, it } from 'vitest';

import {
  contentExtractionSchema,
  evidenceSuggestionSchema,
  extractedTextDocumentSchema,
  storyExcerptSchema,
  transcriptSchema,
} from './content-extraction';

const now = '2026-08-30T10:00:00.000Z';
const provenance = {
  provider: 'tesseract.js',
  model: 'eng',
  version: 'v5-local',
};

describe('content extraction contracts', () => {
  it('accepts a ready OCR extraction with blocks', () => {
    const extraction = contentExtractionSchema.parse({
      schemaVersion: 1,
      id: 'ce_ocr1',
      tributePublicId: 'mv_test',
      assetId: 'asset_1',
      extractionType: 'ocr',
      pipelineStatus: 'ready',
      sourceChecksum: 'abc123456789',
      sourceMediaKind: 'image',
      engineName: 'tesseract.js',
      engineVersion: 'v5-local',
      provenance,
      externalProcessing: false,
    });
    expect(extraction.pipelineStatus).toBe('ready');
    const document = extractedTextDocumentSchema.parse({
      schemaVersion: 1,
      id: 'doc_1',
      extractionId: extraction.id,
      assetId: 'asset_1',
      pageCount: 1,
      blocks: [
        {
          id: 'blk_1',
          pageNumber: 1,
          readingOrder: 0,
          engineText: 'Rotterdam, 14 May 1972',
          scriptKind: 'printed',
        },
      ],
      engineText: 'Rotterdam, 14 May 1972',
      provenance,
    });
    expect(document.blocks).toHaveLength(1);
  });

  it('keeps family correction separate from engine transcript text', () => {
    const transcript = transcriptSchema.parse({
      schemaVersion: 1,
      id: 'tr_1',
      extractionId: 'ce_tr1',
      assetId: 'asset_2',
      durationMs: 4000,
      segments: [
        {
          id: 'seg_1',
          startMs: 0,
          endMs: 2000,
          engineText: 'Dad took us sailing',
          familyText: 'Dad took us sailing near Loosdrecht.',
        },
      ],
      engineText: 'Dad took us sailing',
      familyText: 'Dad took us sailing near Loosdrecht.',
      provenance: {
        provider: 'xenova-whisper-tiny-en',
        model: 'whisper-tiny.en',
        version: 'v1-local',
      },
    });
    expect(transcript.segments[0]?.engineText).not.toBe(transcript.segments[0]?.familyText);
  });

  it('requires explicit story and film approval flags on excerpts', () => {
    const excerpt = storyExcerptSchema.parse({
      schemaVersion: 1,
      id: 'sx_1',
      tributePublicId: 'mv_test',
      assetId: 'asset_2',
      extractionId: 'ce_tr1',
      segmentIds: ['seg_1'],
      approvedText: 'Every Sunday, Dad took us sailing near Loosdrecht.',
      startMs: 1000,
      endMs: 3000,
      approvedForStory: true,
      approvedForFilm: false,
      provenance,
      createdAt: now,
    });
    expect(excerpt.approvedForStory).toBe(true);
    expect(excerpt.approvedForFilm).toBe(false);
  });

  it('stores evidence suggestions as unreviewed by default', () => {
    const suggestion = evidenceSuggestionSchema.parse({
      schemaVersion: 1,
      id: 'es_1',
      extractionId: 'ce_ocr1',
      sourceBlockId: 'blk_1',
      suggestionType: 'date',
      proposedValue: '1972-05-14',
      proposedFactCategory: 'life_date',
      method: 'deterministic_pattern',
      provenance,
      createdAt: now,
    });
    expect(suggestion.reviewState).toBe('unreviewed');
  });
});
