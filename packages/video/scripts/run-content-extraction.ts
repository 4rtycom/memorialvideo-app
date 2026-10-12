import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  contentExtractionSchema,
  extractionIdempotencyKey,
  OCR_ENGINE,
  TRANSCRIPTION_ENGINE,
  type ExtractionType,
} from '@memorialvideo/contracts';
import {
  buildDeterministicEvidenceSuggestions,
  buildOcrDocument,
  buildTranscript,
  planExtractionClaim,
  planExtractionCompletion,
  selectNextExtractionJob,
  suggestionValueHash,
  type ContentExtractionJobRow,
} from '@memorialvideo/domain';
import { runLocalOcr, runLocalTranscription, SOURCE_BUCKET, terminateOcrWorker } from '@memorialvideo/media';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(root, '../..');

function argValue(name: string): string | undefined {
  const flag = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return flag?.slice(name.length + 3);
}

async function loadRepoEnv(): Promise<void> {
  try {
    const text = await readFile(path.resolve(repoRoot, '.env.local'), 'utf8');
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }
      const eq = line.indexOf('=');
      if (eq < 1) {
        continue;
      }
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    return;
  }
}

function writeSafe(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function serviceHeaders(): HeadersInit {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('missing_service_role');
  }
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

function restUrl(pathname: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!base) {
    throw new Error('missing_supabase_url');
  }
  return `${base.replace(/\/$/, '')}/rest/v1/${pathname}`;
}

async function rest<T>(pathname: string, init?: RequestInit & { ignoreConflict?: boolean }): Promise<T> {
  const { ignoreConflict, ...fetchInit } = init ?? {};
  const response = await fetch(restUrl(pathname), {
    ...fetchInit,
    headers: { ...serviceHeaders(), ...(fetchInit.headers ?? {}) },
  });
  if (response.status === 409 && ignoreConflict) {
    return undefined as T;
  }
  if (!response.ok) {
    throw new Error(`rest_${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  if (!text.trim()) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

async function downloadOriginal(bucket: string, key: string): Promise<Uint8Array> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const response = await fetch(`${base}/storage/v1/object/${bucket}/${key}`, {
    headers: serviceHeaders(),
  });
  if (!response.ok) {
    throw new Error('download_failed');
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function main(): Promise<void> {
  await loadRepoEnv();
  const typeArg = (argValue('type') ?? 'ocr') as ExtractionType;
  if (typeArg !== 'ocr' && typeArg !== 'transcription') {
    writeSafe({ claimed: false, error: 'invalid_type' });
    process.exitCode = 1;
    return;
  }
  const localIn = argValue('in');
  if (localIn) {
    const bytes = new Uint8Array(await readFile(path.resolve(localIn)));
    if (typeArg === 'ocr') {
      const result = await runLocalOcr({ bytes, assetId: 'local' });
      writeSafe({
        local: true,
        type: 'ocr',
        engine: result.engineName,
        version: result.engineVersion,
        blockCount: result.blocks.length,
        partial: result.partial,
        warnings: result.warnings,
        textLength: result.fullText.length,
      });
      await terminateOcrWorker();
      return;
    }
    const cacheDir = path.resolve(repoRoot, '.cache', 'transformers');
    const result = await runLocalTranscription({
      bytes,
      cacheDir,
      mimeHint: argValue('mime'),
    });
    const expectedWords = (argValue('expect') ?? '')
      .split(',')
      .map((word) => word.trim().toLowerCase())
      .filter(Boolean);
    const haystack = result.fullText.toLowerCase();
    const matchedWords = expectedWords.filter((word) => haystack.includes(word));
    writeSafe({
      local: true,
      type: 'transcription',
      engine: result.engineName,
      version: result.engineVersion,
      available: result.available,
      segmentCount: result.segments.length,
      partial: result.partial,
      warnings: result.warnings,
      textLength: result.fullText.length,
      sourceMime: result.sourceMime ?? null,
      normalized: Boolean(result.normalized),
      executionMs: result.executionMs ?? null,
      expectedWordCount: expectedWords.length,
      matchedWordCount: matchedWords.length,
      // Fixture-only: never emit transcript body unless intentionally asserted.
      expectPass:
        expectedWords.length === 0 ? null : matchedWords.length >= Math.min(3, expectedWords.length),
    });
    return;
  }

  const staleCutoff = new Date(Date.now() - 60_000).toISOString();
  const stale = await rest<Array<{ id: string; extraction_id: string | null }>>(
    `content_extraction_jobs?status=eq.PREPARING&extraction_type=eq.${typeArg}&started_at=lt.${staleCutoff}&limit=20`,
  );
  for (const row of stale) {
    await rest(`content_extraction_jobs?id=eq.${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'FAILED_RETRYABLE',
        error_code: 'stale_preparing',
        completed_at: new Date().toISOString(),
      }),
    });
    if (row.extraction_id) {
      await rest(`content_extractions?id=eq.${row.extraction_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ pipeline_status: 'queued', error_code: 'stale_preparing' }),
      });
    }
  }

  const rows = await rest<
    Array<{
      id: string;
      project_id: string;
      asset_id: string;
      extraction_id: string | null;
      extraction_type: ExtractionType;
      status: ContentExtractionJobRow['status'];
      idempotency_key: string;
      attempt_count: number;
      queued_at: string;
    }>
  >(
    `content_extraction_jobs?status=in.(QUEUED,FAILED_RETRYABLE)&extraction_type=eq.${typeArg}&order=queued_at.asc&limit=20`,
  );
  const selected = selectNextExtractionJob(
    rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      assetId: row.asset_id,
      extractionId: row.extraction_id,
      extractionType: row.extraction_type,
      status: row.status,
      idempotencyKey: row.idempotency_key,
      attemptCount: row.attempt_count,
      queuedAt: row.queued_at,
    })),
    typeArg,
  );
  if (!selected) {
    writeSafe({ claimed: false, type: typeArg });
    return;
  }
  const claim = planExtractionClaim(selected);
  if (!claim.ok) {
    writeSafe({ claimed: false, reason: claim.reason, type: typeArg });
    return;
  }
  const claimed = await rest<Array<{ id: string }>>(
    `content_extraction_jobs?id=eq.${selected.id}&status=in.(QUEUED,FAILED_RETRYABLE)`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'PREPARING',
        attempt_count: claim.attemptCount,
        started_at: new Date().toISOString(),
      }),
    },
  );
  if (!claimed.length) {
    writeSafe({ claimed: false, reason: 'lost_race', type: typeArg });
    return;
  }

  const assets = await rest<
    Array<{
      id: string;
      storage_bucket: string;
      storage_key: string;
      sha256: string | null;
      declared_mime: string | null;
      asset_type: string | null;
    }>
  >(
    `assets?id=eq.${selected.assetId}&select=id,storage_bucket,storage_key,sha256,declared_mime,asset_type`,
  );
  const asset = assets[0];
  const extractions = await rest<
    Array<{ id: string; public_id: string; payload: unknown; source_checksum: string }>
  >(`content_extractions?id=eq.${selected.extractionId}&select=id,public_id,payload,source_checksum`);
  const extractionRow = extractions[0];
  if (!asset || !extractionRow) {
    await rest(`content_extraction_jobs?id=eq.${selected.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'FAILED_FINAL', error_code: 'missing_rows', completed_at: new Date().toISOString() }),
    });
    writeSafe({ claimed: true, failed: true, error: 'missing_rows', failAsset: false });
    return;
  }

  const tmpDir = path.resolve(root, '.tmp', 'content-extraction', selected.id);
  await mkdir(tmpDir, { recursive: true });
  try {
    const bytes = await downloadOriginal(asset.storage_bucket || SOURCE_BUCKET, asset.storage_key);
    await writeFile(path.join(tmpDir, 'original.bin'), Buffer.from(bytes));
    const startedAt = new Date().toISOString();
    await rest(`content_extractions?id=eq.${extractionRow.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ pipeline_status: 'processing', started_at: startedAt }),
    });

    const baseExtraction = contentExtractionSchema.parse({
      ...(typeof extractionRow.payload === 'object' && extractionRow.payload ? extractionRow.payload : {}),
      schemaVersion: 1,
      id: extractionRow.public_id,
      pipelineStatus: 'processing',
      startedAt,
    });

    if (typeArg === 'ocr') {
      const ocr = await runLocalOcr({ bytes, assetId: selected.assetId });
      const document = buildOcrDocument({
        id: `doc_${extractionRow.public_id.replace(/^ce_/, '').slice(0, 24)}`,
        extractionId: extractionRow.public_id,
        assetId: selected.assetId,
        blocks: ocr.blocks,
        provenance: baseExtraction.provenance,
        language: { status: 'supplied', supplied: 'en' },
      });
      const pipelineStatus = ocr.partial || ocr.blocks.length === 0 ? 'partial' : 'ready';
      const completedAt = new Date().toISOString();
      const extraction = contentExtractionSchema.parse({
        ...baseExtraction,
        pipelineStatus,
        completedAt,
        warnings: ocr.warnings,
        errorCode: ocr.blocks.length === 0 ? 'no_text_detected' : undefined,
      });
      await rest(`content_extractions?id=eq.${extractionRow.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          pipeline_status: pipelineStatus,
          payload: extraction,
          warnings: ocr.warnings,
          error_code: extraction.errorCode ?? null,
          completed_at: completedAt,
        }),
      });
      await rest('ocr_documents', {
        method: 'POST',
        ignoreConflict: true,
        headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({
          public_id: document.id,
          project_id: selected.projectId,
          asset_id: selected.assetId,
          extraction_id: extractionRow.id,
          payload: document,
          review_state: 'unreviewed',
        }),
      });
      const suggestions = buildDeterministicEvidenceSuggestions({
        extraction,
        document,
        createdAt: completedAt,
      });
      for (const suggestion of suggestions) {
        await rest('evidence_suggestions', {
          method: 'POST',
          ignoreConflict: true,
          headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
          body: JSON.stringify({
            public_id: suggestion.id,
            project_id: selected.projectId,
            asset_id: selected.assetId,
            extraction_id: extractionRow.id,
            suggestion_type: suggestion.suggestionType,
            proposed_value_hash: suggestionValueHash(suggestion.suggestionType, suggestion.proposedValue),
            payload: suggestion,
            review_state: 'unreviewed',
          }),
        });
      }
      await rest(`content_extraction_jobs?id=eq.${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'READY',
          completed_at: completedAt,
          error_code: null,
        }),
      });
      writeSafe({
        claimed: true,
        type: 'ocr',
        ready: pipelineStatus === 'ready',
        partial: pipelineStatus === 'partial',
        engine: OCR_ENGINE.name,
        version: OCR_ENGINE.version,
        blockCount: ocr.blocks.length,
        suggestionCount: suggestions.length,
        failAsset: false,
        idempotencyKey: extractionIdempotencyKey(
          selected.assetId,
          extractionRow.source_checksum,
          'ocr',
          OCR_ENGINE.version,
        ),
      });
      return;
    }

    const cacheDir = path.resolve(repoRoot, '.cache', 'transformers');
    const asr = await runLocalTranscription({
      bytes,
      cacheDir,
      mimeHint: asset.declared_mime ?? undefined,
      tempRoot: tmpDir,
    });
    const completedAt = new Date().toISOString();
    if (!asr.available) {
      const completion = planExtractionCompletion({
        attemptCount: claim.attemptCount,
        success: false,
        retryable: true,
      });
      await rest(`content_extractions?id=eq.${extractionRow.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          pipeline_status: 'failed',
          error_code: 'transcription_engine_unavailable',
          warnings: asr.warnings,
          completed_at: completedAt,
        }),
      });
      await rest(`content_extraction_jobs?id=eq.${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: completion.jobStatus,
          error_code: 'transcription_engine_unavailable',
          completed_at: completedAt,
        }),
      });
      writeSafe({
        claimed: true,
        type: 'transcription',
        available: false,
        failed: true,
        failAsset: false,
        engine: TRANSCRIPTION_ENGINE.name,
      });
      return;
    }

    const transcript = buildTranscript({
      id: `tr_${extractionRow.public_id.replace(/^ce_/, '').slice(0, 24)}`,
      extractionId: extractionRow.public_id,
      assetId: selected.assetId,
      durationMs: asr.durationMs,
      segments: asr.segments,
      provenance: {
        provider: TRANSCRIPTION_ENGINE.name,
        model: 'whisper-tiny.en',
        version: TRANSCRIPTION_ENGINE.version,
      },
      language: { status: 'supplied', supplied: 'en' },
    });
    const pipelineStatus = asr.partial || !asr.fullText ? 'partial' : 'ready';
    const extraction = contentExtractionSchema.parse({
      ...baseExtraction,
      engineName: TRANSCRIPTION_ENGINE.name,
      engineVersion: TRANSCRIPTION_ENGINE.version,
      provenance: {
        provider: TRANSCRIPTION_ENGINE.name,
        model: 'whisper-tiny.en',
        version: TRANSCRIPTION_ENGINE.version,
      },
      pipelineStatus,
      completedAt,
      warnings: asr.warnings,
    });
    await rest(`content_extractions?id=eq.${extractionRow.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        pipeline_status: pipelineStatus,
        payload: extraction,
        warnings: asr.warnings,
        completed_at: completedAt,
      }),
    });
    await rest('transcripts', {
      method: 'POST',
      ignoreConflict: true,
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({
        public_id: transcript.id,
        project_id: selected.projectId,
        asset_id: selected.assetId,
        extraction_id: extractionRow.id,
        payload: transcript,
        review_state: 'unreviewed',
      }),
    });
    const suggestions = buildDeterministicEvidenceSuggestions({
      extraction,
      transcript,
      createdAt: completedAt,
    });
    for (const suggestion of suggestions) {
      await rest('evidence_suggestions', {
        method: 'POST',
        ignoreConflict: true,
        headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({
          public_id: suggestion.id,
          project_id: selected.projectId,
          asset_id: selected.assetId,
          extraction_id: extractionRow.id,
          suggestion_type: suggestion.suggestionType,
          proposed_value_hash: suggestionValueHash(suggestion.suggestionType, suggestion.proposedValue),
          payload: suggestion,
          review_state: 'unreviewed',
        }),
      });
    }
    await rest(`content_extraction_jobs?id=eq.${selected.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'READY', completed_at: completedAt, error_code: null }),
    });
    writeSafe({
      claimed: true,
      type: 'transcription',
      ready: pipelineStatus === 'ready',
      partial: pipelineStatus === 'partial',
      engine: TRANSCRIPTION_ENGINE.name,
      version: TRANSCRIPTION_ENGINE.version,
      segmentCount: asr.segments.length,
      suggestionCount: suggestions.length,
      sourceMime: asr.sourceMime ?? null,
      normalized: Boolean(asr.normalized),
      executionMs: asr.executionMs ?? null,
      textLength: asr.fullText.length,
      failAsset: false,
    });
  } catch (error) {
    const completion = planExtractionCompletion({
      attemptCount: claim.attemptCount,
      success: false,
      retryable: true,
    });
    const failedAt = new Date().toISOString();
    if (selected.extractionId) {
      await rest(`content_extractions?id=eq.${selected.extractionId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          pipeline_status: completion.pipelineStatus,
          error_code: 'worker_failed',
          warnings: [String(error instanceof Error ? error.message : 'worker_failed').slice(0, 80)],
          completed_at: failedAt,
        }),
      });
    }
    await rest(`content_extraction_jobs?id=eq.${selected.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: completion.jobStatus,
        error_code: 'worker_failed',
        completed_at: failedAt,
      }),
    });
    writeSafe({
      claimed: true,
      failed: true,
      failAsset: false,
      error: error instanceof Error ? error.message.slice(0, 500) : 'worker_failed',
      jobStatus: completion.jobStatus,
      pipelineStatus: completion.pipelineStatus,
    });
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    await terminateOcrWorker().catch(() => undefined);
  }
}

main().catch((error) => {
  writeSafe({ claimed: false, error: error instanceof Error ? error.message : 'fatal' });
  process.exitCode = 1;
});
