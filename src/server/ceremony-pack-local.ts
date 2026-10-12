import { readFile } from 'node:fs/promises';
import {
  buildCeremonyPackManifest,
  canBuildCeremonyPack,
  ceremonyChecklistText,
  memorialPackPolicy,
} from '@memorialvideo/domain';
import { evaluateCreatorReadiness } from './readiness-local';
import { resolveReadyFinalAbsolutePath } from './render';
import { entitlementView, type Tribute } from './store';
import { buildStoreZip } from './zip-store';

export function planCeremonyPack(tribute: Tribute | null): {
  canBuild: boolean;
  reason: string;
  includesCeremonyPack: boolean;
  outputVerified: boolean;
} {
  if (!tribute) {
    return {
      canBuild: false,
      reason: 'no_tribute',
      includesCeremonyPack: false,
      outputVerified: false,
    };
  }
  const entitlement = entitlementView(tribute);
  const policy = memorialPackPolicy();
  const ready = tribute.renderJobs.find(
    (job) => job.kind === 'final' && job.status === 'READY' && job.outputVerified,
  );
  const includesCeremonyPack = Boolean(entitlement.active && policy.includesCeremonyPack);
  const outputVerified = Boolean(ready?.outputVerified);
  const canBuild = canBuildCeremonyPack({
    includesCeremonyPack,
    outputVerified,
    qcPassed: outputVerified,
  });
  return {
    canBuild,
    includesCeremonyPack,
    outputVerified,
    reason: canBuild
      ? 'ready'
      : !entitlement.active
        ? 'memorial_pack_required'
        : !outputVerified
          ? 'final_ready_required'
          : 'blocked',
  };
}

export async function planCeremonyPackWithReadiness(tribute: Tribute | null): Promise<{
  canBuild: boolean;
  reason: string;
  includesCeremonyPack: boolean;
  outputVerified: boolean;
  readinessBlocking: number;
}> {
  const base = planCeremonyPack(tribute);
  if (!tribute || !base.canBuild) {
    return { ...base, readinessBlocking: 0 };
  }
  const readiness = await evaluateCreatorReadiness(tribute);
  if (!readiness.packAllowed) {
    return {
      ...base,
      canBuild: false,
      reason: readiness.packReason ?? 'readiness_blocking',
      readinessBlocking: readiness.report.activeBlockingCount,
    };
  }
  return { ...base, readinessBlocking: 0 };
}

/**
 * Prompt 18 / MV-067 — owner playback checklist without Memorial Pack or READY MP4.
 * Full Ceremony Pack ZIP remains gated separately.
 */
export function buildOwnerCeremonyChecklist(
  tribute: Tribute | null,
): { ok: true; fileName: string; text: string } | { ok: false; reason: 'no_tribute' } {
  if (!tribute) {
    return { ok: false, reason: 'no_tribute' };
  }
  const manifest = buildCeremonyPackManifest(tribute.publicId);
  return {
    ok: true,
    fileName: manifest.checklistFileName,
    text: ceremonyChecklistText(tribute.publicId),
  };
}

export async function buildCeremonyPackZip(
  tribute: Tribute,
): Promise<{ ok: true; bytes: Uint8Array; fileName: string } | { ok: false; reason: string }> {
  const plan = await planCeremonyPackWithReadiness(tribute);
  if (!plan.canBuild) {
    return { ok: false, reason: plan.reason };
  }
  const absolute = await resolveReadyFinalAbsolutePath(tribute);
  if (!absolute) {
    return { ok: false, reason: 'output_missing' };
  }
  const manifest = buildCeremonyPackManifest(tribute.publicId);
  const mp4 = await readFile(absolute);
  const checklist = new TextEncoder().encode(ceremonyChecklistText(tribute.publicId));
  const manifestJson = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`);
  const meta = new TextEncoder().encode(
    `${JSON.stringify(
      {
        publicId: tribute.publicId,
        displayName: tribute.displayName,
        locale: tribute.locale,
        themeKey: tribute.themeKey,
        soundtrackTrackId: tribute.soundtrackTrackId,
        timelineVersion: tribute.timelineVersion,
        ceremonyChecklist: tribute.ceremonyChecklist,
        packedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  const bytes = buildStoreZip([
    { name: manifest.videoFileName, data: new Uint8Array(mp4) },
    { name: manifest.checklistFileName, data: checklist },
    { name: 'manifest.json', data: manifestJson },
    { name: 'tribute-metadata.json', data: meta },
  ]);
  return {
    ok: true,
    bytes,
    fileName: `${manifest.videoFileName.replace(/-1080p\.mp4$/, '')}-ceremony-pack.zip`,
  };
}
