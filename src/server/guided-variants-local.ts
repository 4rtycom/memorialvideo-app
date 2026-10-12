import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  OUTPUT_ASPECTS,
  OUTPUT_VARIANT_ENGINE,
  OUTPUT_VARIANT_KINDS,
  aspectFromDimensions,
  defaultAspectForVariantKind,
  parseOutputVariantSpec,
  parseTimelineContract,
  totalDurationFrames,
  type OutputAspect,
  type OutputVariantKind,
  type OutputVariantSpec,
  type TimelineContract,
} from '@memorialvideo/contracts';
import {
  countImageScenes,
  hashTimeline,
  proposeOutputVariant,
  sceneIdsTouchedByVariantOps,
} from '@memorialvideo/domain';
import {
  PersistenceUnavailableError,
  assertPersistenceWritable,
  deleteKvString,
  readKvString,
  resolvePersistence,
  writeKvString,
} from './persistence';
import { getTribute, saveTimeline, undoTimeline, type Tribute } from './store';

export type GuidedVariantPending = {
  revisionId: string;
  kind: OutputVariantKind;
  aspect: OutputAspect;
  variant: OutputVariantSpec;
  afterTimeline: TimelineContract;
  beforeAspect: OutputAspect;
  afterAspect: OutputAspect;
  cropUpdates: number;
  durationScaled: boolean;
  audioMuted: boolean;
  operationCount: number;
  baseTimelineVersion: number;
  baseTimelineHash: string;
  status: 'proposed' | 'previewed';
  createdAt: string;
};

export type GuidedVariantsOverview = {
  hasTimeline: boolean;
  currentAspect: OutputAspect | null;
  width: number | null;
  height: number | null;
  pending: boolean;
  pendingKind: OutputVariantKind | null;
  pendingAspect: OutputAspect | null;
  pendingRevisionId: string | null;
  kinds: readonly OutputVariantKind[];
  aspects: readonly OutputAspect[];
  faceAwareReframe: {
    available: false;
    note: string;
  };
  note: string;
};

const FACE_AWARE = {
  available: false as const,
  note: 'Face-aware reframe is deferred — crops inherit family focal points only (not COMPLETE).',
};

function pendingDir(): string {
  return path.join(process.cwd(), '.data', 'guided-variants');
}

function pendingPath(publicId: string): string {
  return path.join(pendingDir(), `${publicId}.json`);
}

function pendingKvKey(publicId: string): string {
  return `mv:creator:guided-variant-pending:v1:${publicId}`;
}

function parsePending(raw: string): GuidedVariantPending | null {
  try {
    const parsed = JSON.parse(raw) as GuidedVariantPending;
    if (!parsed?.revisionId || !parsed?.afterTimeline || !parsed?.variant) {
      return null;
    }
    return {
      ...parsed,
      variant: parseOutputVariantSpec(parsed.variant),
      afterTimeline: parseTimelineContract(parsed.afterTimeline),
    };
  } catch {
    return null;
  }
}

async function readPending(publicId: string): Promise<GuidedVariantPending | null> {
  const persistence = await resolvePersistence();
  try {
    if (persistence.kind === 'vercel_kv') {
      const document = await readKvString(pendingKvKey(publicId));
      return document ? parsePending(document) : null;
    }
    if (!persistence.writable) {
      return null;
    }
    const raw = await readFile(pendingPath(publicId), 'utf8');
    return parsePending(raw);
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) {
      throw error;
    }
    return null;
  }
}

async function writePending(publicId: string, pending: GuidedVariantPending): Promise<void> {
  const persistence = await assertPersistenceWritable();
  const payload = JSON.stringify(pending);
  if (persistence.kind === 'vercel_kv') {
    await writeKvString(pendingKvKey(publicId), payload);
    return;
  }
  try {
    await mkdir(pendingDir(), { recursive: true });
    await writeFile(pendingPath(publicId), payload, 'utf8');
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) {
      throw error;
    }
    throw new PersistenceUnavailableError(
      'Local guided-variant pending persistence is not writable on this host.',
      { kind: 'unavailable', xb012: true },
    );
  }
}

async function clearPending(publicId: string): Promise<void> {
  const persistence = await resolvePersistence();
  try {
    if (persistence.kind === 'vercel_kv') {
      if (persistence.writable) {
        await deleteKvString(pendingKvKey(publicId));
      }
      return;
    }
    await unlink(pendingPath(publicId));
  } catch {
    // absent / unavailable is fine for clear
  }
}

function currentAspectOf(tribute: Tribute): OutputAspect | null {
  if (!tribute.timeline) {
    return null;
  }
  return aspectFromDimensions(tribute.timeline.width, tribute.timeline.height);
}

function unavailableResult(error: PersistenceUnavailableError): GuidedVariantActionResult {
  return { ok: false, error: 'persistence_unavailable', status: 503, persistenceError: error };
}

export async function loadGuidedVariantsOverview(
  tribute: Tribute,
): Promise<GuidedVariantsOverview> {
  let pending: GuidedVariantPending | null = null;
  try {
    pending = await readPending(tribute.publicId);
  } catch (error) {
    if (!(error instanceof PersistenceUnavailableError)) {
      throw error;
    }
    // Overview stays readable; pending simply unknown when persistence is down.
  }
  const aspect = currentAspectOf(tribute);
  return {
    hasTimeline: Boolean(tribute.timeline),
    currentAspect: aspect,
    width: tribute.timeline?.width ?? null,
    height: tribute.timeline?.height ?? null,
    pending: Boolean(pending),
    pendingKind: pending?.kind ?? null,
    pendingAspect: pending?.aspect ?? null,
    pendingRevisionId: pending?.revisionId ?? null,
    kinds: OUTPUT_VARIANT_KINDS,
    aspects: OUTPUT_ASPECTS,
    faceAwareReframe: FACE_AWARE,
    note: `Guided Variants derive ${OUTPUT_VARIANT_ENGINE.name} ${OUTPUT_VARIANT_ENGINE.version} from one TimelineContract. One project; no forked tributes.`,
  };
}

export type GuidedVariantActionResult =
  | {
      ok: true;
      revisionId?: string;
      kind?: OutputVariantKind;
      beforeAspect?: OutputAspect;
      afterAspect?: OutputAspect;
      width?: number;
      height?: number;
      cropUpdates?: number;
      durationScaled?: boolean;
      audioMuted?: boolean;
      operationCount?: number;
      scenesTouched?: number;
      imageScenes?: number;
      totalDurationFrames?: number;
      previewTimeline?: TimelineContract;
      timeline?: TimelineContract;
      timelineVersion?: number;
      faceAwareReframe: GuidedVariantsOverview['faceAwareReframe'];
    }
  | {
      ok: false;
      error: string;
      status: number;
      persistenceError?: PersistenceUnavailableError;
    };

function parseKind(value: unknown): OutputVariantKind | null {
  if (typeof value !== 'string') {
    return null;
  }
  return (OUTPUT_VARIANT_KINDS as readonly string[]).includes(value)
    ? (value as OutputVariantKind)
    : null;
}

function parseAspect(value: unknown): OutputAspect | null {
  if (typeof value !== 'string') {
    return null;
  }
  return (OUTPUT_ASPECTS as readonly string[]).includes(value) ? (value as OutputAspect) : null;
}

export async function proposeGuidedVariant(
  publicId: string,
  input: { kind?: unknown; aspect?: unknown },
): Promise<GuidedVariantActionResult> {
  try {
    const tribute = await getTribute(publicId);
    if (!tribute) {
      return { ok: false, error: 'not_found', status: 404 };
    }
    if (!tribute.timeline) {
      return { ok: false, error: 'needs_timeline', status: 409 };
    }
    const kind = parseKind(input.kind) ?? 'vertical';
    const aspect = parseAspect(input.aspect) ?? defaultAspectForVariantKind(kind);
    const baseTimelineHash = hashTimeline(tribute.timeline);
    let proposal;
    try {
      proposal = proposeOutputVariant({
        timeline: tribute.timeline,
        kind,
        aspect,
        baseTimelineHash,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'variant_failed';
      return { ok: false, error: message, status: 400 };
    }

    const pending: GuidedVariantPending = {
      revisionId: `ovr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
      kind,
      aspect: proposal.afterAspect,
      variant: proposal.variant,
      afterTimeline: proposal.afterTimeline,
      beforeAspect: proposal.beforeAspect,
      afterAspect: proposal.afterAspect,
      cropUpdates: proposal.cropUpdates,
      durationScaled: proposal.durationScaled,
      audioMuted: proposal.audioMuted,
      operationCount: proposal.operations.length,
      baseTimelineVersion: tribute.timelineVersion,
      baseTimelineHash,
      status: 'proposed',
      createdAt: new Date().toISOString(),
    };
    await writePending(publicId, pending);

    return {
      ok: true,
      revisionId: pending.revisionId,
      kind,
      beforeAspect: proposal.beforeAspect,
      afterAspect: proposal.afterAspect,
      width: proposal.afterTimeline.width,
      height: proposal.afterTimeline.height,
      cropUpdates: proposal.cropUpdates,
      durationScaled: proposal.durationScaled,
      audioMuted: proposal.audioMuted,
      operationCount: proposal.operations.length,
      scenesTouched: sceneIdsTouchedByVariantOps(proposal.operations).length,
      imageScenes: countImageScenes(tribute.timeline),
      totalDurationFrames: totalDurationFrames(proposal.afterTimeline),
      faceAwareReframe: FACE_AWARE,
    };
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) {
      return unavailableResult(error);
    }
    throw error;
  }
}

export async function previewGuidedVariant(publicId: string): Promise<GuidedVariantActionResult> {
  try {
    const tribute = await getTribute(publicId);
    if (!tribute) {
      return { ok: false, error: 'not_found', status: 404 };
    }
    if (!tribute.timeline) {
      return { ok: false, error: 'needs_timeline', status: 409 };
    }
    const pending = await readPending(publicId);
    if (!pending) {
      return { ok: false, error: 'needs_propose', status: 409 };
    }
    if (hashTimeline(tribute.timeline) !== pending.baseTimelineHash) {
      await clearPending(publicId);
      return { ok: false, error: 'stale_base', status: 409 };
    }
    pending.status = 'previewed';
    await writePending(publicId, pending);
    return {
      ok: true,
      revisionId: pending.revisionId,
      kind: pending.kind,
      beforeAspect: pending.beforeAspect,
      afterAspect: pending.afterAspect,
      width: pending.afterTimeline.width,
      height: pending.afterTimeline.height,
      cropUpdates: pending.cropUpdates,
      durationScaled: pending.durationScaled,
      audioMuted: pending.audioMuted,
      operationCount: pending.operationCount,
      previewTimeline: pending.afterTimeline,
      totalDurationFrames: totalDurationFrames(pending.afterTimeline),
      faceAwareReframe: FACE_AWARE,
    };
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) {
      return unavailableResult(error);
    }
    throw error;
  }
}

export async function applyGuidedVariant(publicId: string): Promise<GuidedVariantActionResult> {
  try {
    const tribute = await getTribute(publicId);
    if (!tribute) {
      return { ok: false, error: 'not_found', status: 404 };
    }
    if (!tribute.timeline) {
      return { ok: false, error: 'needs_timeline', status: 409 };
    }
    const pending = await readPending(publicId);
    if (!pending) {
      return { ok: false, error: 'needs_propose', status: 409 };
    }
    if (hashTimeline(tribute.timeline) !== pending.baseTimelineHash) {
      await clearPending(publicId);
      return { ok: false, error: 'stale_base', status: 409 };
    }

    const saved = await saveTimeline(publicId, pending.afterTimeline, {
      expectedVersion: tribute.timelineVersion,
      clientUpdatedAt: tribute.updatedAt,
    });
    if (!saved.ok) {
      return {
        ok: false,
        error: saved.reason,
        status: saved.reason === 'conflict' ? 409 : 404,
      };
    }
    await clearPending(publicId);
    return {
      ok: true,
      revisionId: pending.revisionId,
      kind: pending.kind,
      beforeAspect: pending.beforeAspect,
      afterAspect: pending.afterAspect,
      width: saved.tribute.timeline?.width,
      height: saved.tribute.timeline?.height,
      cropUpdates: pending.cropUpdates,
      durationScaled: pending.durationScaled,
      audioMuted: pending.audioMuted,
      operationCount: pending.operationCount,
      timeline: saved.tribute.timeline ?? pending.afterTimeline,
      timelineVersion: saved.tribute.timelineVersion,
      faceAwareReframe: FACE_AWARE,
    };
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) {
      return unavailableResult(error);
    }
    throw error;
  }
}

/** One-step undo of the last timeline publish (typically guided variant apply). */
export async function revertGuidedVariant(publicId: string): Promise<GuidedVariantActionResult> {
  try {
    const tribute = await getTribute(publicId);
    if (!tribute) {
      return { ok: false, error: 'not_found', status: 404 };
    }
    if (!tribute.timelinePrevious) {
      return { ok: false, error: 'nothing_to_revert', status: 409 };
    }
    const reverted = await undoTimeline(publicId, tribute.timelineVersion);
    if (!reverted.ok) {
      return {
        ok: false,
        error: reverted.reason === 'conflict' ? 'conflict' : reverted.reason,
        status: reverted.reason === 'conflict' ? 409 : 404,
      };
    }
    await clearPending(publicId);
    const aspect = reverted.tribute.timeline
      ? aspectFromDimensions(reverted.tribute.timeline.width, reverted.tribute.timeline.height)
      : null;
    return {
      ok: true,
      timeline: reverted.tribute.timeline ?? undefined,
      timelineVersion: reverted.tribute.timelineVersion,
      afterAspect: aspect ?? undefined,
      width: reverted.tribute.timeline?.width,
      height: reverted.tribute.timeline?.height,
      faceAwareReframe: FACE_AWARE,
    };
  } catch (error) {
    if (error instanceof PersistenceUnavailableError) {
      return unavailableResult(error);
    }
    throw error;
  }
}
