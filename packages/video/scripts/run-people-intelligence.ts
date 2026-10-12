import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PEOPLE_ENGINE,
  faceObservationSchema,
  peopleConsentSchema,
  personClusterSchemaV2,
  type PeopleJobStatus,
} from '@memorialvideo/contracts';
import {
  MAX_OBSERVATIONS_PER_ASSET,
  MAX_VIDEO_SAMPLE_FRAMES,
  clusterObservationsBySimilarity,
  peopleProcessingAllowed,
  planPeopleClaim,
  planVideoSampleTimestamps,
  selectNextPeopleJob,
  type PeopleJobRow,
} from '@memorialvideo/domain';
import {
  SOURCE_BUCKET,
  sampleVideoFramesForPeople,
} from '@memorialvideo/media';
import {
  bytesToEmbedding,
  embeddingToBytes,
  runLocalFaceDetection,
} from '@memorialvideo/media/people-faces';

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

async function rest<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(restUrl(pathname), {
    ...init,
    headers: { ...serviceHeaders(), ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    throw new Error(`rest_${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
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

function newPublicId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

async function main(): Promise<void> {
  await loadRepoEnv();
  const localIn = argValue('in');
  const modelDir = path.resolve(repoRoot, '.cache', 'face-api');

  if (localIn) {
    const bytes = new Uint8Array(await readFile(path.resolve(localIn)));
    const lower = localIn.toLowerCase();
    if (lower.endsWith('.mp4') || lower.endsWith('.mov')) {
      const sampled = await sampleVideoFramesForPeople({
        bytes,
        mimeHint: 'video/mp4',
        maxFrames: MAX_VIDEO_SAMPLE_FRAMES,
      });
      if (!sampled.ok) {
        writeSafe({
          local: true,
          video: true,
          ok: false,
          reason: sampled.reason,
          warnings: sampled.warnings,
          leftLocalEnvironment: false,
        });
        return;
      }
      let hitCount = 0;
      const frameHits: Array<{ frame: number; timestampMs: number; hits: number }> = [];
      for (const frame of sampled.frames) {
        const result = await runLocalFaceDetection({ bytes: frame.jpegBytes, modelDir });
        hitCount += result.hits.length;
        frameHits.push({ frame: frame.index, timestampMs: frame.timestampMs, hits: result.hits.length });
      }
      writeSafe({
        local: true,
        video: true,
        ok: true,
        frameCount: sampled.frames.length,
        durationMs: sampled.durationMs,
        hitCount,
        frameHits,
        warnings: sampled.warnings,
        leftLocalEnvironment: false,
      });
      return;
    }
    const result = await runLocalFaceDetection({ bytes, modelDir });
    writeSafe({
      local: true,
      engine: result.engineName,
      version: result.engineVersion,
      available: result.available,
      hitCount: result.hits.length,
      partial: result.partial,
      warnings: result.warnings,
      durationMs: result.durationMs,
      leftLocalEnvironment: false,
    });
    return;
  }

  const rows = await rest<
    Array<{
      id: string;
      project_id: string;
      asset_id: string;
      status: PeopleJobStatus;
      idempotency_key: string;
      attempt_count: number;
      queued_at: string;
    }>
  >('face_detection_jobs?status=in.(QUEUED,FAILED_RETRYABLE)&order=queued_at.asc&limit=20');

  const selected = selectNextPeopleJob(
    rows.map(
      (row): PeopleJobRow => ({
        id: row.id,
        projectId: row.project_id,
        assetId: row.asset_id,
        status: row.status,
        idempotencyKey: row.idempotency_key,
        attemptCount: row.attempt_count,
        queuedAt: row.queued_at,
      }),
    ),
  );
  if (!selected) {
    writeSafe({ claimed: false });
    return;
  }

  const claim = planPeopleClaim(selected);
  if (!claim.ok) {
    writeSafe({ claimed: false, reason: claim.reason });
    return;
  }

  const claimed = await rest<Array<{ id: string }>>(
    `face_detection_jobs?id=eq.${selected.id}&status=in.(QUEUED,FAILED_RETRYABLE)`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'PREPARING',
        attempt_count: claim.attemptCount,
        started_at: new Date().toISOString(),
        error_code: null,
      }),
    },
  );
  if (!claimed.length) {
    writeSafe({ claimed: false, reason: 'lost_race' });
    return;
  }

  const projects = await rest<Array<{ id: string; public_id: string }>>(
    `projects?id=eq.${selected.projectId}&select=id,public_id`,
  );
  const project = projects[0];
  if (!project) {
    await rest(`face_detection_jobs?id=eq.${selected.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'FAILED_FINAL',
        error_code: 'project_missing',
        completed_at: new Date().toISOString(),
      }),
    });
    writeSafe({ claimed: true, status: 'FAILED_FINAL', failAsset: false });
    return;
  }

  const consents = await rest<Array<Record<string, unknown>>>(
    `people_intelligence_consents?project_id=eq.${selected.projectId}&select=*`,
  );
  const consentRow = consents[0];
  const consent = consentRow
    ? peopleConsentSchema.parse({
        schemaVersion: 1,
        tributePublicId: project.public_id,
        state: consentRow.state,
        localApproved: consentRow.local_approved,
        externalApproved: consentRow.external_approved,
        externalProvider: consentRow.external_provider ?? undefined,
        policyVersion: consentRow.policy_version ?? 'people-intelligence-v1',
        retainFamilyLabelsOnDeletion: consentRow.retain_family_labels ?? false,
        version: consentRow.version ?? 0,
        changeTimeline: false,
      })
    : null;

  if (!peopleProcessingAllowed(consent)) {
    await rest(`face_detection_jobs?id=eq.${selected.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'CANCELLED',
        error_code: 'consent_revoked',
        completed_at: new Date().toISOString(),
      }),
    });
    writeSafe({ claimed: true, status: 'CANCELLED', reason: 'consent_revoked', failAsset: false });
    return;
  }

  const assets = await rest<
    Array<{ id: string; storage_bucket: string; storage_key: string; asset_type: string; deleted_at: string | null }>
  >(`assets?id=eq.${selected.assetId}&select=id,storage_bucket,storage_key,asset_type,deleted_at`);
  const asset = assets[0];
  if (!asset || asset.deleted_at) {
    await rest(`face_detection_jobs?id=eq.${selected.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'FAILED_FINAL',
        error_code: 'asset_missing',
        completed_at: new Date().toISOString(),
      }),
    });
    writeSafe({ claimed: true, status: 'FAILED_FINAL', failAsset: false });
    return;
  }

  if (asset.asset_type !== 'image' && asset.asset_type !== 'video') {
    await rest(`face_detection_jobs?id=eq.${selected.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'READY',
        error_code: 'unsupported_asset_type',
        completed_at: new Date().toISOString(),
      }),
    });
    writeSafe({ claimed: true, status: 'READY', observationCount: 0, clusterCount: 0, failAsset: false });
    return;
  }

  const tmpDir = path.resolve(root, '.tmp', 'people-intelligence', selected.id);
  await mkdir(tmpDir, { recursive: true });
  try {
    const bytes = await downloadOriginal(asset.storage_bucket || SOURCE_BUCKET, asset.storage_key);
    type DetectionHit = Awaited<ReturnType<typeof runLocalFaceDetection>>['hits'][number] & {
      frameTimestampMs?: number;
      pageOrFrame?: string;
    };
    let hits: DetectionHit[] = [];
    let detectionAvailable = true;
    let detectionPartial = false;
    let detectionWarnings: string[] = [];
    let detectionDurationMs = 0;
    let detectionEngineName: string = 'unavailable';
    let detectionEngineVersion = 'none';

    if (asset.asset_type === 'video') {
      const probe = await sampleVideoFramesForPeople({
        bytes,
        mimeHint: 'video/mp4',
        maxFrames: 1,
        timestampsMs: [0],
      });
      if (!probe.ok) {
        const retryable = claim.attemptCount < 3 && probe.reason !== 'unsupported_input';
        await rest(`face_detection_jobs?id=eq.${selected.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: retryable ? 'FAILED_RETRYABLE' : 'FAILED_FINAL',
            error_code: probe.reason,
            completed_at: new Date().toISOString(),
          }),
        });
        writeSafe({
          claimed: true,
          status: retryable ? 'FAILED_RETRYABLE' : 'FAILED_FINAL',
          warnings: probe.warnings,
          assetType: 'video',
          failAsset: false,
        });
        return;
      }
      const sampled = await sampleVideoFramesForPeople({
        bytes,
        mimeHint: 'video/mp4',
        maxFrames: MAX_VIDEO_SAMPLE_FRAMES,
        timestampsMs: planVideoSampleTimestamps({
          durationMs: probe.durationMs && probe.durationMs > 0 ? probe.durationMs : 8_000,
          maxFrames: MAX_VIDEO_SAMPLE_FRAMES,
        }),
      });
      if (!sampled.ok) {
        const retryable = claim.attemptCount < 3;
        await rest(`face_detection_jobs?id=eq.${selected.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: retryable ? 'FAILED_RETRYABLE' : 'FAILED_FINAL',
            error_code: sampled.reason,
            completed_at: new Date().toISOString(),
          }),
        });
        writeSafe({
          claimed: true,
          status: retryable ? 'FAILED_RETRYABLE' : 'FAILED_FINAL',
          warnings: sampled.warnings,
          assetType: 'video',
          failAsset: false,
        });
        return;
      }
      detectionWarnings.push(...sampled.warnings);
      for (const frame of sampled.frames) {
        if (hits.length >= MAX_OBSERVATIONS_PER_ASSET) {
          detectionWarnings.push('observation_cap_reached');
          detectionPartial = true;
          break;
        }
        const frameDetection = await runLocalFaceDetection({
          bytes: frame.jpegBytes,
          modelDir,
          maxFaces: MAX_OBSERVATIONS_PER_ASSET - hits.length,
        });
        detectionDurationMs += frameDetection.durationMs;
        detectionEngineName = frameDetection.engineName;
        detectionEngineVersion = frameDetection.engineVersion;
        if (!frameDetection.available) {
          detectionAvailable = false;
          detectionWarnings.push(...frameDetection.warnings);
          continue;
        }
        detectionPartial = detectionPartial || frameDetection.partial;
        for (const hit of frameDetection.hits) {
          hits.push({
            ...hit,
            frameTimestampMs: frame.timestampMs,
            pageOrFrame: `frame_${frame.index}`,
          });
        }
      }
      if (hits.length === 0 && !detectionAvailable) {
        const retryable = claim.attemptCount < 3;
        await rest(`face_detection_jobs?id=eq.${selected.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: retryable ? 'FAILED_RETRYABLE' : 'FAILED_FINAL',
            error_code: detectionWarnings[0] ?? 'face_engine_unavailable',
            completed_at: new Date().toISOString(),
          }),
        });
        writeSafe({
          claimed: true,
          status: retryable ? 'FAILED_RETRYABLE' : 'FAILED_FINAL',
          warnings: detectionWarnings,
          assetType: 'video',
          failAsset: false,
        });
        return;
      }
    } else {
      const imageDetection = await runLocalFaceDetection({
        bytes,
        modelDir,
        maxFaces: MAX_OBSERVATIONS_PER_ASSET,
      });
      detectionAvailable = imageDetection.available;
      detectionPartial = imageDetection.partial;
      detectionWarnings = imageDetection.warnings;
      detectionDurationMs = imageDetection.durationMs;
      detectionEngineName = imageDetection.engineName;
      detectionEngineVersion = imageDetection.engineVersion;
      hits = imageDetection.hits;
      if (!imageDetection.available) {
        const retryable = claim.attemptCount < 3;
        await rest(`face_detection_jobs?id=eq.${selected.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: retryable ? 'FAILED_RETRYABLE' : 'FAILED_FINAL',
            error_code: imageDetection.warnings[0] ?? 'face_engine_unavailable',
            completed_at: new Date().toISOString(),
          }),
        });
        writeSafe({
          claimed: true,
          status: retryable ? 'FAILED_RETRYABLE' : 'FAILED_FINAL',
          warnings: imageDetection.warnings,
          failAsset: false,
        });
        return;
      }
    }

    const detection = {
      hits,
      partial: detectionPartial,
      warnings: detectionWarnings,
      durationMs: detectionDurationMs,
      engineName: detectionEngineName,
      engineVersion: detectionEngineVersion,
      available: detectionAvailable,
    };

    const now = new Date().toISOString();
    const items: Array<{
      observation: ReturnType<typeof faceObservationSchema.parse>;
      embedding: Float32Array;
      observationUuid?: string;
    }> = [];

    for (const hit of detection.hits) {
      const publicId = newPublicId('fo');
      const observation = faceObservationSchema.parse({
        schemaVersion: 1,
        id: publicId,
        tributePublicId: project.public_id,
        assetId: selected.assetId,
        frameTimestampMs: hit.frameTimestampMs,
        pageOrFrame: hit.pageOrFrame,
        bbox: hit.bbox,
        detectionConfidence: hit.detectionConfidence,
        qualityCodes: hit.qualityCodes,
        poseOcclusionCodes: hit.poseOcclusionCodes,
        detectorName: hit.detectorName,
        detectorVersion: hit.detectorVersion,
        provenance: hit.provenance,
        pipelineStatus: detection.partial ? 'partial' : 'ready',
        reviewState: 'unreviewed',
        exclusionState: 'none',
        createdAt: now,
      });
      const inserted = await rest<Array<{ id: string }>>('face_observations', {
        method: 'POST',
        body: JSON.stringify({
          public_id: publicId,
          project_id: selected.projectId,
          asset_id: selected.assetId,
          frame_timestamp_ms: hit.frameTimestampMs ?? null,
          payload: observation,
          review_state: 'unreviewed',
          exclusion_state: 'none',
          pipeline_status: observation.pipelineStatus,
        }),
      });
      const observationUuid = inserted[0]?.id;
      if (!observationUuid) {
        continue;
      }
      await rest('face_representations', {
        method: 'POST',
        body: JSON.stringify({
          observation_id: observationUuid,
          project_id: selected.projectId,
          model_name: PEOPLE_ENGINE.representation,
          model_version: PEOPLE_ENGINE.version,
          dimensions: hit.embedding.length,
          embedding: `\\x${embeddingToBytes(hit.embedding).toString('hex')}`,
        }),
      });
      items.push({ observation, embedding: hit.embedding, observationUuid });
    }

    const existingObs = await rest<
      Array<{ id: string; public_id: string; payload: unknown; exclusion_state: string }>
    >(
      `face_observations?project_id=eq.${selected.projectId}&exclusion_state=eq.none&select=id,public_id,payload,exclusion_state&limit=500`,
    );
    const existingReps = await rest<
      Array<{ observation_id: string; embedding: string; deleted_at: string | null }>
    >(
      `face_representations?project_id=eq.${selected.projectId}&deleted_at=is.null&select=observation_id,embedding,deleted_at&limit=500`,
    );
    const embeddingByObsUuid = new Map<string, Float32Array>();
    for (const rep of existingReps) {
      const hex =
        typeof rep.embedding === 'string' && rep.embedding.startsWith('\\x')
          ? rep.embedding.slice(2)
          : null;
      if (!hex) {
        continue;
      }
      embeddingByObsUuid.set(rep.observation_id, bytesToEmbedding(Buffer.from(hex, 'hex')));
    }

    const clusterItems = existingObs
      .map((row) => {
        const embedding = embeddingByObsUuid.get(row.id);
        if (!embedding) {
          return null;
        }
        const payload = row.payload as Record<string, unknown>;
        try {
          const observation = faceObservationSchema.parse({
            ...payload,
            id: row.public_id,
            tributePublicId: project.public_id,
            assetId: (payload.assetId as string) ?? selected.assetId,
          });
          return { observation, embedding };
        } catch {
          return null;
        }
      })
      .filter(
        (item): item is { observation: ReturnType<typeof faceObservationSchema.parse>; embedding: Float32Array } =>
          Boolean(item),
      );

    await rest(`person_clusters?project_id=eq.${selected.projectId}&review_state=eq.unreviewed`, {
      method: 'DELETE',
    });

    const clusters = clusterObservationsBySimilarity({
      tributePublicId: project.public_id,
      items: clusterItems,
      createdAt: now,
    });

    let clusterCount = 0;
    for (const cluster of clusters) {
      const validated = personClusterSchemaV2.parse(cluster);
      const insertedCluster = await rest<Array<{ id: string }>>('person_clusters', {
        method: 'POST',
        body: JSON.stringify({
          public_id: validated.id,
          project_id: selected.projectId,
          payload: validated,
          review_state: 'unreviewed',
          version: 0,
        }),
      });
      const clusterUuid = insertedCluster[0]?.id;
      if (!clusterUuid) {
        continue;
      }
      clusterCount += 1;
      for (const memberId of validated.memberObservationIds) {
        const obs = existingObs.find((row) => row.public_id === memberId);
        if (!obs) {
          continue;
        }
        await rest('person_cluster_members', {
          method: 'POST',
          body: JSON.stringify({
            cluster_id: clusterUuid,
            observation_id: obs.id,
            project_id: selected.projectId,
          }),
        });
      }
    }

    await rest(`face_detection_jobs?id=eq.${selected.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'READY',
        error_code: detection.partial ? detection.warnings[0] ?? 'partial' : null,
        completed_at: new Date().toISOString(),
      }),
    });

    writeSafe({
      claimed: true,
      status: 'READY',
      observationCount: items.length,
      clusterCount,
      durationMs: detection.durationMs,
      engine: detection.engineName,
      version: detection.engineVersion,
      warnings: detection.warnings,
      assetType: asset.asset_type,
      leftLocalEnvironment: false,
      failAsset: false,
    });
  } catch (error) {
    const code =
      error instanceof Error
        ? error.message.replace(/[^\w.\-:/ ]+/g, '').slice(0, 80) || 'people_worker_failed'
        : 'people_worker_failed';
    const retryable = claim.attemptCount < 3;
    await rest(`face_detection_jobs?id=eq.${selected.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: retryable ? 'FAILED_RETRYABLE' : 'FAILED_FINAL',
        error_code: code,
        completed_at: new Date().toISOString(),
      }),
    });
    writeSafe({
      claimed: true,
      status: retryable ? 'FAILED_RETRYABLE' : 'FAILED_FINAL',
      error: code,
      failAsset: false,
    });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  writeSafe({
    claimed: false,
    error: error instanceof Error ? error.message.slice(0, 80) : 'people_worker_crash',
  });
  process.exitCode = 1;
});
