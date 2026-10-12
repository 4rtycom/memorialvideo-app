import { describe, expect, it } from 'vitest';

import {
  buildDeterministicEvidenceSuggestions,
  createExtractionRecord,
  privateEvidenceExcluded,
  sanitizeExtractedPlainText,
} from './content-extraction';

describe('content extraction domain', () => {
  it('strips markup from extracted text treated as data', () => {
    expect(sanitizeExtractedPlainText('<script>alert(1)</script>Rotterdam 1972')).toContain('Rotterdam 1972');
    expect(sanitizeExtractedPlainText('<script>alert(1)</script>Rotterdam 1972')).not.toContain('<script>');
  });

  it('builds deterministic date and place suggestions from OCR blocks', () => {
    const extraction = createExtractionRecord({
      id: 'ce_1',
      tributePublicId: 'mv_test',
      assetId: 'a1',
      extractionType: 'ocr',
      sourceChecksum: 'checksum123456',
      sourceMediaKind: 'image',
      pipelineStatus: 'ready',
    });
    const suggestions = buildDeterministicEvidenceSuggestions({
      extraction,
      document: {
        schemaVersion: 1,
        id: 'doc_1',
        extractionId: extraction.id,
        assetId: 'a1',
        pageCount: 1,
        blocks: [
          {
            id: 'blk_1',
            pageNumber: 1,
            readingOrder: 0,
            engineText: 'Rotterdam, 14 May 1972',
            scriptKind: 'printed',
            reviewState: 'unreviewed',
          },
        ],
        engineText: 'Rotterdam, 14 May 1972',
        reviewState: 'unreviewed',
        language: { status: 'unknown' },
        handwritingClaimed: false,
        provenance: extraction.provenance,
      },
      createdAt: '2026-08-30T10:00:00.000Z',
    });
    expect(suggestions.some((item) => item.suggestionType === 'date')).toBe(true);
    expect(suggestions.every((item) => item.reviewState === 'unreviewed')).toBe(true);
    expect(suggestions.every((item) => item.method === 'deterministic_pattern')).toBe(true);
  });

  it('excludes private and rejected evidence from story surfaces', () => {
    expect(privateEvidenceExcluded('keep_private')).toBe(true);
    expect(privateEvidenceExcluded('rejected')).toBe(true);
    expect(privateEvidenceExcluded('confirmed')).toBe(false);
  });
});
