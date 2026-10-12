import { createHash } from 'node:crypto';

import {
  contentExtractionSchema,
  evidenceSuggestionSchema,
  extractedTextDocumentSchema,
  OCR_ENGINE,
  TRANSCRIPTION_ENGINE,
  transcriptSchema,
  type ContentExtraction,
  type EvidenceSuggestion,
  type ExtractedTextDocument,
  type ExtractionJobStatus,
  type ExtractionType,
  type OcrBlock,
  type Transcript,
  type TranscriptSegment,
} from '@memorialvideo/contracts';

export const MAX_EXTRACTION_ATTEMPTS = 3;

export type ContentExtractionJobRow = {
  id: string;
  projectId: string;
  assetId: string;
  extractionId: string | null;
  extractionType: ExtractionType;
  status: ExtractionJobStatus;
  idempotencyKey: string;
  attemptCount: number;
  queuedAt: string;
};

export function selectNextExtractionJob(
  rows: readonly ContentExtractionJobRow[],
  type?: ExtractionType,
): ContentExtractionJobRow | null {
  const eligible = rows
    .filter(
      (row) =>
        (row.status === 'QUEUED' || row.status === 'FAILED_RETRYABLE') &&
        (!type || row.extractionType === type),
    )
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  return eligible[0] ?? null;
}

export function planExtractionClaim(row: ContentExtractionJobRow):
  | { ok: true; nextStatus: 'PREPARING'; attemptCount: number }
  | { ok: false; reason: 'not_claimable' | 'retry_exhausted' } {
  if (row.status !== 'QUEUED' && row.status !== 'FAILED_RETRYABLE') {
    return { ok: false, reason: 'not_claimable' };
  }
  if (row.attemptCount >= MAX_EXTRACTION_ATTEMPTS) {
    return { ok: false, reason: 'retry_exhausted' };
  }
  return { ok: true, nextStatus: 'PREPARING', attemptCount: row.attemptCount + 1 };
}

export function planExtractionCompletion(input: {
  attemptCount: number;
  success: boolean;
  retryable: boolean;
}): { jobStatus: ExtractionJobStatus; pipelineStatus: ContentExtraction['pipelineStatus'] } {
  if (input.success) {
    return { jobStatus: 'READY', pipelineStatus: 'ready' };
  }
  if (input.retryable && input.attemptCount < MAX_EXTRACTION_ATTEMPTS) {
    return { jobStatus: 'FAILED_RETRYABLE', pipelineStatus: 'failed' };
  }
  return { jobStatus: 'FAILED_FINAL', pipelineStatus: 'failed' };
}

export function suggestionValueHash(suggestionType: string, proposedValue: string): string {
  return createHash('sha256').update(`${suggestionType}:${proposedValue}`).digest('hex').slice(0, 32);
}

const DATE_PATTERNS: Array<{ re: RegExp; toIso: (match: RegExpMatchArray) => string | null }> = [
  {
    re: /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i,
    toIso: (match) => {
      const months: Record<string, string> = {
        january: '01',
        february: '02',
        march: '03',
        april: '04',
        may: '05',
        june: '06',
        july: '07',
        august: '08',
        september: '09',
        october: '10',
        november: '11',
        december: '12',
      };
      const month = months[match[2]!.toLowerCase()];
      if (!month) {
        return null;
      }
      return `${match[3]}-${month}-${match[1]!.padStart(2, '0')}`;
    },
  },
  {
    re: /\b(\d{4})-(\d{2})-(\d{2})\b/,
    toIso: (match) => `${match[1]}-${match[2]}-${match[3]}`,
  },
];

const PLACE_PATTERN = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;

export function buildDeterministicEvidenceSuggestions(input: {
  extraction: ContentExtraction;
  document?: ExtractedTextDocument;
  transcript?: Transcript;
  createdAt: string;
}): EvidenceSuggestion[] {
  const suggestions: EvidenceSuggestion[] = [];
  const push = (
    partial: Omit<EvidenceSuggestion, 'schemaVersion' | 'version' | 'createdAt' | 'provenance' | 'method' | 'reviewState'> & {
      method?: EvidenceSuggestion['method'];
      reviewState?: EvidenceSuggestion['reviewState'];
      provenance?: EvidenceSuggestion['provenance'];
    },
  ) => {
    suggestions.push(
      evidenceSuggestionSchema.parse({
        schemaVersion: 1,
        version: 0,
        createdAt: input.createdAt,
        provenance: input.extraction.provenance,
        method: 'deterministic_pattern',
        reviewState: 'unreviewed',
        ...partial,
      }),
    );
  };

  for (const block of input.document?.blocks ?? []) {
    for (const pattern of DATE_PATTERNS) {
      const match = block.engineText.match(pattern.re);
      if (!match) {
        continue;
      }
      const iso = pattern.toIso(match);
      if (!iso) {
        continue;
      }
      push({
        id: `es_${suggestionValueHash('date', `${input.extraction.id}:${iso}`).slice(0, 16)}`,
        extractionId: input.extraction.id,
        sourceBlockId: block.id,
        sourcePage: block.pageNumber,
        suggestionType: 'date',
        proposedValue: iso,
        proposedFactCategory: 'life_date',
        confidence: block.confidence,
      });
    }
    const places = [...block.engineText.matchAll(PLACE_PATTERN)].map((item) => item[1]!).filter(Boolean);
    for (const place of places.slice(0, 3)) {
      if (/^(January|February|March|April|May|June|July|August|September|October|November|December)$/i.test(place)) {
        continue;
      }
      push({
        id: `es_${suggestionValueHash('place', `${input.extraction.id}:${place}`).slice(0, 16)}`,
        extractionId: input.extraction.id,
        sourceBlockId: block.id,
        sourcePage: block.pageNumber,
        suggestionType: 'place',
        proposedValue: place,
        proposedFactCategory: 'place',
        confidence: block.confidence,
      });
    }
  }

  for (const segment of input.transcript?.segments ?? []) {
    if (segment.silence || segment.unintelligible || segment.engineText.trim().length < 12) {
      continue;
    }
    push({
      id: `es_${suggestionValueHash('spoken_excerpt', `${input.extraction.id}:${segment.startMs}:${segment.engineText}`).slice(0, 16)}`,
      extractionId: input.extraction.id,
      sourceSegmentId: segment.id,
      sourceStartMs: segment.startMs,
      sourceEndMs: segment.endMs,
      suggestionType: 'spoken_excerpt',
      proposedValue: segment.engineText.slice(0, 500),
      proposedFactCategory: 'quote',
      confidence: segment.confidence,
    });
  }

  const seen = new Set<string>();
  return suggestions.filter((item) => {
    const key = `${item.suggestionType}:${item.proposedValue}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function sanitizeExtractedPlainText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, ' ')
    .split('')
    .map((char) => (char.charCodeAt(0) < 32 ? ' ' : char))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildOcrDocument(input: {
  id: string;
  extractionId: string;
  assetId: string;
  blocks: OcrBlock[];
  provenance: ContentExtraction['provenance'];
  language?: ExtractedTextDocument['language'];
}): ExtractedTextDocument {
  const blocks = input.blocks.map((block, index) => ({
    ...block,
    engineText: sanitizeExtractedPlainText(block.engineText).slice(0, 8000),
    readingOrder: block.readingOrder ?? index,
  }));
  return extractedTextDocumentSchema.parse({
    schemaVersion: 1,
    id: input.id,
    extractionId: input.extractionId,
    assetId: input.assetId,
    pageCount: Math.max(1, ...blocks.map((block) => block.pageNumber), 1),
    blocks,
    engineText: blocks.map((block) => block.engineText).join('\n').slice(0, 50_000),
    language: input.language ?? { status: 'unknown' },
    handwritingClaimed: false,
    provenance: input.provenance,
    reviewState: 'unreviewed',
  });
}

export function buildTranscript(input: {
  id: string;
  extractionId: string;
  assetId: string;
  durationMs: number;
  segments: TranscriptSegment[];
  provenance: ContentExtraction['provenance'];
  language?: Transcript['language'];
}): Transcript {
  const segments = input.segments.map((segment) => ({
    ...segment,
    engineText: sanitizeExtractedPlainText(segment.engineText).slice(0, 4000),
  }));
  return transcriptSchema.parse({
    schemaVersion: 1,
    id: input.id,
    extractionId: input.extractionId,
    assetId: input.assetId,
    durationMs: input.durationMs,
    segments,
    engineText: segments.map((segment) => segment.engineText).join(' ').slice(0, 100_000),
    language: input.language ?? { status: 'unknown' },
    provenance: input.provenance,
    reviewState: 'unreviewed',
  });
}

export function createExtractionRecord(input: {
  id: string;
  tributePublicId: string;
  assetId: string;
  extractionType: ExtractionType;
  sourceChecksum: string;
  sourceMediaKind: ContentExtraction['sourceMediaKind'];
  pipelineStatus?: ContentExtraction['pipelineStatus'];
  externalProcessing?: boolean;
}): ContentExtraction {
  const engine = input.extractionType === 'ocr' ? OCR_ENGINE : TRANSCRIPTION_ENGINE;
  return contentExtractionSchema.parse({
    schemaVersion: 1,
    id: input.id,
    tributePublicId: input.tributePublicId,
    assetId: input.assetId,
    extractionType: input.extractionType,
    pipelineStatus: input.pipelineStatus ?? 'queued',
    sourceChecksum: input.sourceChecksum,
    sourceMediaKind: input.sourceMediaKind,
    engineName: engine.name,
    engineVersion: engine.version,
    provenance: {
      provider: engine.name,
      model: input.extractionType === 'ocr' ? 'eng' : 'whisper-tiny.en',
      version: engine.version,
    },
    externalProcessing: input.externalProcessing ?? false,
  });
}

export function privateEvidenceExcluded(reviewState: string): boolean {
  return reviewState === 'keep_private' || reviewState === 'rejected';
}
