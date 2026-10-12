import {
  BETA_MUSIC_CATALOG,
  canProceedWithCeremonyPack,
  catalogTrackById,
  ceremonyMusicLicenseStatuses,
  defaultCeremonyMusicPlan,
  evaluateCeremonyReadiness,
  evaluateOutputQc,
  memorialPackPolicy,
} from '@memorialvideo/domain';
import {
  ceremonyMusicPlanSchema,
  parseTimelineContract,
  type CeremonyReadinessReport,
} from '@memorialvideo/contracts';
import { peopleProcessingAllowed } from '@memorialvideo/domain';
import { probeLocalOutput } from './render';
import { entitlementView, peopleConsentFor, type Tribute } from './store';

export async function evaluateCreatorReadiness(tribute: Tribute): Promise<{
  report: CeremonyReadinessReport;
  packAllowed: boolean;
  packReason: string | null;
}> {
  const entitlement = entitlementView(tribute);
  const policy = memorialPackPolicy();
  const readyFinal = tribute.renderJobs.find(
    (job) => job.kind === 'final' && job.status === 'READY' && job.outputVerified,
  );
  let outputQc: { ready: boolean; failures: string[] } | null = null;
  if (readyFinal?.outputPath) {
    const probe = await probeLocalOutput(readyFinal.outputPath);
    const timeline = tribute.timeline ? parseTimelineContract(tribute.timeline) : null;
    const expectedDuration = timeline
      ? timeline.scenes.reduce((sum, s) => sum + s.durationFrames, 0) / timeline.fps
      : 0;
    const qc = evaluateOutputQc({
      probe,
      expectedDurationSeconds: expectedDuration,
      requireAudio: true,
      expectedWidth: timeline?.width ?? 1920,
      expectedHeight: timeline?.height ?? 1080,
    });
    outputQc = { ready: qc.ready, failures: qc.failures };
  }

  const timeline = tribute.timeline ? parseTimelineContract(tribute.timeline) : null;
  const planParsed = ceremonyMusicPlanSchema.safeParse(tribute.ceremonyMusicPlan);
  const plan =
    planParsed.success
      ? planParsed.data
      : tribute.soundtrackTrackId
        ? defaultCeremonyMusicPlan(tribute.soundtrackTrackId)
        : null;
  const planTracks = plan
    ? [
        plan.slots.opening.trackKey,
        plan.slots.tribute.trackKey,
        plan.slots.reflection.trackKey,
        plan.slots.closing.trackKey,
      ]
        .filter((key): key is string => Boolean(key))
        .map((key) => catalogTrackById(key))
        .filter((t): t is NonNullable<typeof t> => Boolean(t))
    : [];
  const catalogStatuses =
    plan && tribute.musicRightsConfirmed
      ? ceremonyMusicLicenseStatuses({
          plan,
          tracks: planTracks.length > 0 ? planTracks : [...BETA_MUSIC_CATALOG],
        })
      : tribute.soundtrackTrackId && tribute.musicRightsConfirmed
        ? (['development_only'] as const)
        : ([] as const);

  const report = evaluateCeremonyReadiness({
    reportId: `crd_${tribute.publicId.slice(-12)}`,
    timeline,
    displayName: tribute.displayName,
    outputQc,
    finalRenderReady: Boolean(readyFinal),
    finalOutputVerified: Boolean(readyFinal?.outputVerified),
    storyConflicts: [],
    duplicatePairs: [],
    qualityObservations: [],
    peopleConsentActive: peopleProcessingAllowed(peopleConsentFor(tribute)),
    peopleObservations: [],
    peopleProfiles: tribute.peopleProfiles.map((p) => ({
      personId: p.id,
      approvedForFilm: p.approvedForFilm,
      linkedAssetIds: [] as const,
      familyConfirmed: true,
    })),
    openCollaborationTaskCount: tribute.memories.filter((m) => m.reviewState === 'pending').length,
    musicRightsAccepted: tribute.musicRightsConfirmed && Boolean(tribute.soundtrackTrackId),
    audioMix: timeline?.audio ?? null,
    catalogMusicLicenseStatuses: [...catalogStatuses],
    sensitiveImageryCodes: [],
    privateInfoSignalKinds: [],
    confirmations: [],
    includesCeremonyPackEntitlement: Boolean(entitlement.active && policy.includesCeremonyPack),
  });

  const pack = canProceedWithCeremonyPack(report);
  return {
    report,
    packAllowed: pack.allowed,
    packReason: pack.allowed ? null : pack.reason,
  };
}

export function summarizeReadiness(report: CeremonyReadinessReport) {
  return {
    reportId: report.id,
    provenance: report.provenance,
    activeBlockingCount: report.activeBlockingCount,
    blocking: report.findings.filter(
      (f: CeremonyReadinessReport['findings'][number]) =>
        f.severity === 'blocking' && f.status === 'open',
    ).length,
    warnings: report.findings.filter(
      (f: CeremonyReadinessReport['findings'][number]) =>
        f.severity === 'warning' && f.status === 'open',
    ).length,
    findings: report.findings.map((f: CeremonyReadinessReport['findings'][number]) => ({
      id: f.id,
      code: f.code,
      severity: f.severity,
      status: f.status,
      labelKey: f.labelKey,
      detail: f.detail,
      evidenceState: f.evidenceState,
    })),
  };
}
