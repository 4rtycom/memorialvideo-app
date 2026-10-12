import { describe, expect, it } from 'vitest';

import { DEFAULT_FPS, parseTimelineContract } from '@memorialvideo/contracts';

import {
  canProceedWithCeremonyPack,
  countActiveBlocking,
  countAllowlistedPrivateInfo,
  countAllowlistedSensitiveImagery,
  countCroppedFaceSignals,
  countFaceNearEdgeSignals,
  countFilmApprovedPersonMissing,
  countUnconfirmedPeopleInFilm,
  evaluateCeremonyReadiness,
  faceObservationTouchesEdge,
  planCeremonyReadinessConfirmation,
  peopleObservationsAvailable,
  shouldWarnFinalDownload,
  type CeremonyReadinessPeopleObservationSignal,
  type CeremonyReadinessPersonProfileSignal,
} from './ceremony-readiness';

function baseTimeline() {
  return parseTimelineContract({
    schemaVersion: 1,
    fps: DEFAULT_FPS,
    width: 1920,
    height: 1080,
    seed: 11,
    locale: 'en',
    themeKey: 'timeless',
    watermark: true,
    displayName: 'Alex',
    scenes: [
      {
        id: 'intro',
        type: 'intro',
        durationFrames: 30,
        transitionIn: 'fade',
        transitionOut: 'fade',
        displayName: 'Alex',
      },
      {
        id: 'ch1',
        type: 'chapter',
        durationFrames: 45,
        transitionIn: 'fade',
        transitionOut: 'fade',
        title: 'Early years',
      },
      {
        id: 'img1',
        type: 'image',
        durationFrames: 90,
        transitionIn: 'fade',
        transitionOut: 'fade',
        asset: { assetId: 'asset_a', src: 'storage://assets/a' },
        caption: 'A short note',
      },
      {
        id: 'img2',
        type: 'image',
        durationFrames: 90,
        transitionIn: 'fade',
        transitionOut: 'fade',
        asset: { assetId: 'asset_a', src: 'storage://assets/a' },
        caption: 'x'.repeat(120),
      },
      {
        id: 'outro',
        type: 'outro',
        durationFrames: 30,
        transitionIn: 'fade',
        transitionOut: 'fade',
        closingLine: 'Remembered',
      },
    ],
  });
}

function nearEdgeObs(
  overrides: Partial<CeremonyReadinessPeopleObservationSignal> = {},
): CeremonyReadinessPeopleObservationSignal {
  return {
    observationId: 'fo_edge',
    assetId: 'asset_a',
    bbox: { x: 0.01, y: 0.2, width: 0.2, height: 0.25 },
    detectionConfidence: 0.4,
    qualityCodes: ['low_confidence', 'near_edge'],
    reviewState: 'unreviewed',
    exclusionState: 'none',
    ...overrides,
  };
}

function evaluate(overrides: Partial<Parameters<typeof evaluateCeremonyReadiness>[0]> = {}) {
  return evaluateCeremonyReadiness({
    reportId: 'crr_test',
    timeline: baseTimeline(),
    outputQc: { ready: true, failures: [] },
    finalRenderReady: true,
    finalOutputVerified: true,
    storyConflicts: [],
    duplicatePairs: [],
    qualityObservations: [],
    peopleConsentActive: false,
    peopleObservations: [],
    peopleProfiles: [],
    openCollaborationTaskCount: 0,
    musicRightsAccepted: true,
    audioMix: null,
    catalogMusicLicenseStatuses: [],
    sensitiveImageryCodes: [],
    privateInfoSignalKinds: [],
    confirmations: [],
    includesCeremonyPackEntitlement: true,
    ...overrides,
  });
}

describe('ceremony readiness', () => {
  it('composes Output QC without replacing it and rejects a single score UX', () => {
    const report = evaluate({
      outputQc: { ready: false, failures: ['resolution', 'audio_missing'] },
      finalRenderReady: false,
      finalOutputVerified: false,
      includesCeremonyPackEntitlement: false,
    });
    expect(report.singleScoreInsufficient).toBe(true);
    expect(report.findings.some((f) => f.code === 'output_qc_failed' && f.evidenceState === 'composed')).toBe(
      true,
    );
    expect(report.findings.some((f) => f.code === 'playback_not_ready')).toBe(true);
    expect(report.findings.some((f) => f.code === 'audio_missing')).toBe(true);
    expect(report.activeBlockingCount).toBeGreaterThan(0);
    expect(canProceedWithCeremonyPack(report).allowed).toBe(false);
    expect(shouldWarnFinalDownload(report)).toBe(true);
  });

  it('flags duplicate scenes, long captions, deferred face crops, and deferred sensitive imagery', () => {
    const report = evaluate();
    expect(report.findings.some((f) => f.code === 'duplicate_scenes')).toBe(true);
    expect(report.findings.some((f) => f.code === 'caption_readability')).toBe(true);
    expect(report.findings.some((f) => f.code === 'cropped_faces_deferred' && f.evidenceState === 'deferred')).toBe(
      true,
    );
    expect(
      report.findings.some((f) => f.code === 'sensitive_imagery_deferred' && f.evidenceState === 'deferred'),
    ).toBe(true);
    expect(report.findings.some((f) => f.code === 'private_info_deferred' && f.evidenceState === 'deferred')).toBe(
      true,
    );
    expect(report.findings.some((f) => f.code === 'names_consistency' && f.severity === 'needs_confirmation')).toBe(
      true,
    );
  });

  it('emits real face/people findings when consent + observations exist (never invents without signals)', () => {
    expect(
      peopleObservationsAvailable({ peopleConsentActive: false, peopleObservations: [nearEdgeObs()] }),
    ).toBe(false);
    expect(faceObservationTouchesEdge({ x: 0.01, y: 0.2, width: 0.2, height: 0.25 })).toBe(true);
    expect(countFaceNearEdgeSignals([nearEdgeObs()])).toBe(1);
    expect(countCroppedFaceSignals([nearEdgeObs()])).toBe(1);

    const centerSafe: CeremonyReadinessPeopleObservationSignal = {
      observationId: 'fo_center',
      assetId: 'asset_a',
      bbox: { x: 0.35, y: 0.3, width: 0.3, height: 0.35 },
      detectionConfidence: 0.9,
      qualityCodes: [],
      reviewState: 'confirmed',
      exclusionState: 'none',
    };
    expect(countFaceNearEdgeSignals([centerSafe])).toBe(0);
    expect(countUnconfirmedPeopleInFilm([nearEdgeObs(), centerSafe], new Set(['asset_a']))).toBe(1);

    const profiles: CeremonyReadinessPersonProfileSignal[] = [
      {
        personId: 'pp_missing',
        approvedForFilm: true,
        linkedAssetIds: ['asset_elsewhere'],
        familyConfirmed: true,
      },
    ];
    expect(countFilmApprovedPersonMissing(profiles, new Set(['asset_a']))).toBe(1);

    const report = evaluate({
      peopleConsentActive: true,
      peopleObservations: [nearEdgeObs()],
      peopleProfiles: profiles,
    });
    expect(report.findings.some((f) => f.code === 'cropped_faces_deferred')).toBe(false);
    expect(report.findings.some((f) => f.code === 'cropped_faces' && f.evidenceState === 'observed')).toBe(true);
    expect(report.findings.some((f) => f.code === 'face_near_edge' && f.evidenceState === 'observed')).toBe(true);
    expect(
      report.findings.some((f) => f.code === 'unconfirmed_people_in_film' && f.severity === 'needs_confirmation'),
    ).toBe(true);
    expect(report.findings.some((f) => f.code === 'film_approved_person_missing')).toBe(true);
  });

  it('keeps sensitive/private deferred unless allowlisted signals are present', () => {
    expect(countAllowlistedSensitiveImagery(['soft_focus', 'low_resolution'])).toBe(0);
    expect(countAllowlistedSensitiveImagery(['sensitive_imagery', 'soft_focus'])).toBe(1);
    expect(countAllowlistedPrivateInfo(['captured_at'])).toBe(0);
    expect(countAllowlistedPrivateInfo(['exif_location'])).toBe(1);

    const without = evaluate();
    expect(without.findings.some((f) => f.code === 'sensitive_imagery_deferred')).toBe(true);
    expect(without.findings.some((f) => f.code === 'private_info_deferred')).toBe(true);

    const withSignals = evaluate({
      sensitiveImageryCodes: ['sensitive_imagery'],
      privateInfoSignalKinds: ['exif_location'],
    });
    expect(
      withSignals.findings.some((f) => f.code === 'sensitive_imagery' && f.evidenceState === 'observed'),
    ).toBe(true);
    expect(
      withSignals.findings.some((f) => f.code === 'private_info_exposure' && f.evidenceState === 'observed'),
    ).toBe(true);
    expect(withSignals.findings.some((f) => f.code === 'sensitive_imagery_deferred')).toBe(false);
    expect(withSignals.findings.some((f) => f.code === 'private_info_deferred')).toBe(false);
  });

  it('lets family confirm needs_confirmation without auto-clearing hard blockers', () => {
    const report = evaluate({
      finalRenderReady: false,
      finalOutputVerified: false,
      includesCeremonyPackEntitlement: false,
    });
    const names = report.findings.find((f) => f.code === 'names_consistency');
    expect(names).toBeTruthy();
    const planned = planCeremonyReadinessConfirmation({
      finding: names!,
      outcome: 'confirm',
      confirmationId: 'crc_1',
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) {
      return;
    }
    const withConfirm = evaluate({
      finalRenderReady: false,
      finalOutputVerified: false,
      includesCeremonyPackEntitlement: false,
      confirmations: [planned.confirmation],
    });
    const confirmed = withConfirm.findings.find((f) => f.code === 'names_consistency');
    expect(confirmed?.status).toBe('confirmed');
    expect(withConfirm.findings.some((f) => f.code === 'playback_not_ready' && f.status === 'open')).toBe(true);
    expect(countActiveBlocking(withConfirm.findings)).toBeGreaterThan(0);
    const hard = withConfirm.findings.find((f) => f.code === 'playback_not_ready')!;
    expect(
      planCeremonyReadinessConfirmation({
        finding: hard,
        outcome: 'acknowledge',
        confirmationId: 'crc_bad',
      }).ok,
    ).toBe(false);
  });

  it('blocks music without rights and allows pack when blockers clear', () => {
    const blocked = evaluate({
      musicRightsAccepted: false,
      timeline: parseTimelineContract({
        ...baseTimeline(),
        music: {
          trackId: 'music_1',
          src: 'storage://music/placeholder',
          fadeInFrames: 30,
          fadeOutFrames: 45,
        },
      }),
    });
    expect(blocked.findings.some((f) => f.code === 'audio_rights_unknown' && f.severity === 'blocking')).toBe(
      true,
    );
    expect(canProceedWithCeremonyPack(blocked).reason).toBe('readiness_blocking');

    const clear = evaluate({
      musicRightsAccepted: true,
      peopleConsentActive: true,
      peopleObservations: [
        {
          observationId: 'fo_ok',
          assetId: 'asset_a',
          bbox: { x: 0.3, y: 0.3, width: 0.3, height: 0.3 },
          detectionConfidence: 0.9,
          qualityCodes: [],
          reviewState: 'confirmed',
          exclusionState: 'none',
        },
      ],
    });
    // Deferred sensitive/private suggestions remain; blockers for pack prerequisites should be clear.
    expect(clear.activeBlockingCount).toBe(0);
    expect(canProceedWithCeremonyPack(clear).allowed).toBe(true);
    expect(clear.findings.some((f) => f.code === 'cropped_faces_deferred')).toBe(false);
  });
});
