import { createHash } from 'node:crypto';

import {
  CEREMONY_READINESS_ENGINE,
  ceremonyReadinessFindingSchema,
  ceremonyReadinessReportSchema,
  type AudioMixContract,
  type CeremonyReadinessConfirmation,
  type CeremonyReadinessFinding,
  type CeremonyReadinessFindingCode,
  type CeremonyReadinessReport,
  type TimelineContract,
} from '@memorialvideo/contracts';

import type { OutputQcResult } from './output-qc';

export type CeremonyReadinessConflictSignal = {
  id: string;
  state: string;
  kind: string;
  familyDisagreement: boolean;
};

export type CeremonyReadinessDuplicateSignal = {
  pairId: string;
  reviewState: string;
};

export type CeremonyReadinessQualitySignal = {
  assetId: string;
  code: string;
  severity: string;
};

/** Face observation signal — never includes embeddings, names, or media bytes. */
export type CeremonyReadinessPeopleObservationSignal = {
  observationId: string;
  assetId: string;
  bbox: { x: number; y: number; width: number; height: number };
  detectionConfidence: number;
  qualityCodes: readonly string[];
  reviewState: string;
  exclusionState: string;
};

/** Person profile signal for film-approval / timeline coverage checks. */
export type CeremonyReadinessPersonProfileSignal = {
  personId: string;
  approvedForFilm: boolean;
  linkedAssetIds: readonly string[];
  familyConfirmed: boolean;
};

/**
 * Allowlisted AssetAnalysis / observation codes that may become sensitive_imagery.
 * Never invent moderation — only consume existing allowlisted codes.
 */
export const SENSITIVE_IMAGERY_ALLOWLIST = [
  'sensitive_imagery',
  'possibly_sensitive',
  'sensitive_content',
] as const;

/**
 * Allowlisted private-info signal kinds already produced by analysis/extraction.
 * `exif_location` = unreviewed GPS IFD present on AssetAnalysis metadata.
 * `extraction_private_flag` = extraction already flagged a reviewable private marker.
 */
export const PRIVATE_INFO_SIGNAL_ALLOWLIST = ['exif_location', 'extraction_private_flag'] as const;

export const FACE_EDGE_MARGIN = 0.05;
export const FACE_LOW_CONFIDENCE_THRESHOLD = 0.55;

export type CeremonyReadinessEvaluateInput = {
  reportId: string;
  timeline: TimelineContract | null;
  /** Used for name confirmation when timeline is not yet published. */
  displayName?: string;
  /** Composed Output QC — readiness does not replace evaluateOutputQc. */
  outputQc: Pick<OutputQcResult, 'ready' | 'failures'> | null;
  finalRenderReady: boolean;
  finalOutputVerified: boolean;
  storyConflicts: readonly CeremonyReadinessConflictSignal[];
  duplicatePairs: readonly CeremonyReadinessDuplicateSignal[];
  qualityObservations: readonly CeremonyReadinessQualitySignal[];
  /** People Intelligence consent must be active before face findings are real. */
  peopleConsentActive: boolean;
  peopleObservations: readonly CeremonyReadinessPeopleObservationSignal[];
  peopleProfiles: readonly CeremonyReadinessPersonProfileSignal[];
  openCollaborationTaskCount: number;
  musicRightsAccepted: boolean;
  audioMix: AudioMixContract | null;
  /** License statuses for catalog tracks referenced by the ceremony music plan. */
  catalogMusicLicenseStatuses: readonly string[];
  /** Allowlisted sensitive codes observed on assets (empty → deferred). */
  sensitiveImageryCodes: readonly string[];
  /** Allowlisted private-info kinds (empty → deferred). */
  privateInfoSignalKinds: readonly string[];
  confirmations: readonly CeremonyReadinessConfirmation[];
  includesCeremonyPackEntitlement: boolean;
};

const CAPTION_SOFT_MAX = 90;
const CHAPTER_BALANCE_RATIO = 4;

export function faceObservationTouchesEdge(
  bbox: { x: number; y: number; width: number; height: number },
  margin = FACE_EDGE_MARGIN,
): boolean {
  return (
    bbox.x < margin ||
    bbox.y < margin ||
    bbox.x + bbox.width > 1 - margin ||
    bbox.y + bbox.height > 1 - margin
  );
}

export function isActivePeopleObservation(obs: CeremonyReadinessPeopleObservationSignal): boolean {
  if (obs.exclusionState !== 'none') {
    return false;
  }
  if (obs.reviewState === 'excluded' || obs.reviewState === 'false_positive') {
    return false;
  }
  return true;
}

export function peopleObservationsAvailable(input: {
  peopleConsentActive: boolean;
  peopleObservations: readonly CeremonyReadinessPeopleObservationSignal[];
}): boolean {
  return input.peopleConsentActive && input.peopleObservations.length > 0;
}

export function countFaceNearEdgeSignals(
  observations: readonly CeremonyReadinessPeopleObservationSignal[],
): number {
  return observations.filter((obs) => {
    if (!isActivePeopleObservation(obs)) {
      return false;
    }
    const nearEdge =
      obs.qualityCodes.includes('near_edge') || faceObservationTouchesEdge(obs.bbox);
    const lowConfidence =
      obs.detectionConfidence < FACE_LOW_CONFIDENCE_THRESHOLD ||
      obs.qualityCodes.includes('low_confidence');
    return nearEdge && lowConfidence;
  }).length;
}

export function countCroppedFaceSignals(
  observations: readonly CeremonyReadinessPeopleObservationSignal[],
): number {
  return observations.filter((obs) => {
    if (!isActivePeopleObservation(obs)) {
      return false;
    }
    const nearEdge =
      obs.qualityCodes.includes('near_edge') || faceObservationTouchesEdge(obs.bbox);
    const small = obs.qualityCodes.includes('small_face');
    // Crop risk: face clipped by frame edge, or small face already at the edge.
    return nearEdge || (small && nearEdge);
  }).length;
}

export function timelineMediaAssetIds(timeline: TimelineContract | null): Set<string> {
  const ids = new Set<string>();
  if (!timeline) {
    return ids;
  }
  for (const scene of timeline.scenes) {
    if (scene.type === 'image' || scene.type === 'video') {
      ids.add(scene.asset.assetId);
    }
  }
  return ids;
}

export function countUnconfirmedPeopleInFilm(
  observations: readonly CeremonyReadinessPeopleObservationSignal[],
  filmAssetIds: ReadonlySet<string>,
): number {
  return observations.filter((obs) => {
    if (!isActivePeopleObservation(obs)) {
      return false;
    }
    if (obs.reviewState !== 'unreviewed') {
      return false;
    }
    return filmAssetIds.has(obs.assetId);
  }).length;
}

export function countFilmApprovedPersonMissing(
  profiles: readonly CeremonyReadinessPersonProfileSignal[],
  filmAssetIds: ReadonlySet<string>,
): number {
  return profiles.filter((profile) => {
    if (!profile.approvedForFilm) {
      return false;
    }
    if (profile.linkedAssetIds.length === 0) {
      return true;
    }
    return !profile.linkedAssetIds.some((assetId) => filmAssetIds.has(assetId));
  }).length;
}

export function countAllowlistedSensitiveImagery(codes: readonly string[]): number {
  const allow = new Set<string>(SENSITIVE_IMAGERY_ALLOWLIST);
  return codes.filter((code) => allow.has(code)).length;
}

export function countAllowlistedPrivateInfo(kinds: readonly string[]): number {
  const allow = new Set<string>(PRIVATE_INFO_SIGNAL_ALLOWLIST);
  return kinds.filter((kind) => allow.has(kind)).length;
}

function findingId(code: CeremonyReadinessFindingCode, subjectId?: string): string {
  return subjectId ? `f_${code}_${subjectId.slice(0, 24)}` : `f_${code}`;
}

function labelKeyFor(code: CeremonyReadinessFindingCode): string {
  return `readiness.finding.${code}`;
}

function pushFinding(
  findings: CeremonyReadinessFinding[],
  input: Parameters<typeof ceremonyReadinessFindingSchema.parse>[0],
): void {
  findings.push(ceremonyReadinessFindingSchema.parse(input));
}

/**
 * Deterministic Ceremony Readiness evaluator.
 * Composes Output QC; never invents moderation or face crops without signals.
 */
export function evaluateCeremonyReadiness(input: CeremonyReadinessEvaluateInput): CeremonyReadinessReport {
  const findings: CeremonyReadinessFinding[] = [];
  const timeline = input.timeline;

  // --- Playback / Output QC composition (not a replacement) ---
  if (!input.finalRenderReady || !input.finalOutputVerified) {
    pushFinding(findings, {
      id: findingId('playback_not_ready'),
      code: 'playback_not_ready',
      severity: 'blocking',
      status: 'open',
      labelKey: labelKeyFor('playback_not_ready'),
      detail: `ready=${input.finalRenderReady};verified=${input.finalOutputVerified}`,
      evidenceState: 'observed',
      requiresHumanConfirmation: false,
      confirmationClearsActive: false,
      relatedSubjectType: 'render',
      relatedSubjectId: 'final',
    });
  }

  if (input.outputQc && !input.outputQc.ready) {
    pushFinding(findings, {
      id: findingId('output_qc_failed'),
      code: 'output_qc_failed',
      severity: 'blocking',
      status: 'open',
      labelKey: labelKeyFor('output_qc_failed'),
      detail: `failures=${input.outputQc.failures.length}`,
      evidenceState: 'composed',
      requiresHumanConfirmation: false,
      confirmationClearsActive: false,
      relatedSubjectType: 'output_qc',
      relatedSubjectId: 'final',
    });
  }

  if (!input.includesCeremonyPackEntitlement || !input.finalRenderReady || !input.finalOutputVerified) {
    pushFinding(findings, {
      id: findingId('ceremony_pack_prerequisites'),
      code: 'ceremony_pack_prerequisites',
      severity: 'blocking',
      status: 'open',
      labelKey: labelKeyFor('ceremony_pack_prerequisites'),
      detail: `entitlement=${input.includesCeremonyPackEntitlement}`,
      evidenceState: 'observed',
      requiresHumanConfirmation: false,
      confirmationClearsActive: false,
      relatedSubjectType: 'ceremony_pack',
      relatedSubjectId: 'pack',
    });
  }

  // --- Story / factual consistency ---
  for (const conflict of input.storyConflicts) {
    if (conflict.state === 'resolved' || conflict.state === 'dismissed' || conflict.state === 'preserved') {
      continue;
    }
    const isDate = conflict.kind.includes('date') || conflict.kind === 'date_conflict';
    pushFinding(findings, {
      id: findingId(isDate ? 'questionable_dates' : 'story_conflict_open', conflict.id),
      code: isDate ? 'questionable_dates' : 'story_conflict_open',
      severity: conflict.familyDisagreement ? 'needs_confirmation' : 'warning',
      status: 'open',
      labelKey: labelKeyFor(isDate ? 'questionable_dates' : 'story_conflict_open'),
      evidenceState: 'observed',
      requiresHumanConfirmation: true,
      confirmationClearsActive: true,
      relatedSubjectType: 'story_conflict',
      relatedSubjectId: conflict.id,
    });
    if (conflict.familyDisagreement) {
      pushFinding(findings, {
        id: findingId('factual_inconsistency', conflict.id),
        code: 'factual_inconsistency',
        severity: 'needs_confirmation',
        status: 'open',
        labelKey: labelKeyFor('factual_inconsistency'),
        evidenceState: 'observed',
        requiresHumanConfirmation: true,
        confirmationClearsActive: true,
        relatedSubjectType: 'story_conflict',
        relatedSubjectId: conflict.id,
      });
    }
  }

  if (timeline?.displayName || (input.displayName && input.displayName.trim().length > 0)) {
    pushFinding(findings, {
      id: findingId('names_consistency'),
      code: 'names_consistency',
      severity: 'needs_confirmation',
      status: 'open',
      labelKey: labelKeyFor('names_consistency'),
      evidenceState: 'observed',
      requiresHumanConfirmation: true,
      confirmationClearsActive: true,
      relatedSubjectType: 'timeline_scene',
      relatedSubjectId: 'display_name',
    });
  }

  // --- Timeline structure ---
  if (timeline) {
    const assetSceneCounts = new Map<string, number>();
    const chapterDurations: number[] = [];
    let currentChapterFrames = 0;
    let chapterCount = 0;
    let sawChapter = false;

    for (const scene of timeline.scenes) {
      if (scene.type === 'chapter') {
        if (sawChapter && currentChapterFrames === 0) {
          pushFinding(findings, {
            id: findingId('empty_chapter', scene.id),
            code: 'empty_chapter',
            severity: 'warning',
            status: 'open',
            labelKey: labelKeyFor('empty_chapter'),
            evidenceState: 'observed',
            requiresHumanConfirmation: false,
            confirmationClearsActive: false,
            relatedSubjectType: 'timeline_scene',
            relatedSubjectId: scene.id,
          });
        }
        if (sawChapter) {
          chapterDurations.push(currentChapterFrames);
        }
        sawChapter = true;
        chapterCount += 1;
        currentChapterFrames = 0;
        continue;
      }
      if (sawChapter) {
        currentChapterFrames += scene.durationFrames;
      }
      if (scene.type === 'image' || scene.type === 'video') {
        const assetId = scene.asset.assetId;
        assetSceneCounts.set(assetId, (assetSceneCounts.get(assetId) ?? 0) + 1);
        const caption = scene.caption;
        if (caption && caption.length > CAPTION_SOFT_MAX) {
          pushFinding(findings, {
            id: findingId('caption_readability', scene.id),
            code: 'caption_readability',
            severity: 'warning',
            status: 'open',
            labelKey: labelKeyFor('caption_readability'),
            detail: `len=${caption.length}`,
            evidenceState: 'observed',
            requiresHumanConfirmation: false,
            confirmationClearsActive: false,
            relatedSubjectType: 'timeline_scene',
            relatedSubjectId: scene.id,
          });
        }
      }
    }
    if (sawChapter) {
      chapterDurations.push(currentChapterFrames);
      if (currentChapterFrames === 0) {
        pushFinding(findings, {
          id: findingId('empty_chapter', 'trailing'),
          code: 'empty_chapter',
          severity: 'warning',
          status: 'open',
          labelKey: labelKeyFor('empty_chapter'),
          evidenceState: 'observed',
          requiresHumanConfirmation: false,
          confirmationClearsActive: false,
          relatedSubjectType: 'timeline_scene',
          relatedSubjectId: 'trailing',
        });
      }
    }

    for (const [assetId, count] of assetSceneCounts) {
      if (count >= 2) {
        pushFinding(findings, {
          id: findingId('duplicate_scenes', assetId),
          code: 'duplicate_scenes',
          severity: 'warning',
          status: 'open',
          labelKey: labelKeyFor('duplicate_scenes'),
          detail: `count=${count}`,
          evidenceState: 'observed',
          requiresHumanConfirmation: true,
          confirmationClearsActive: true,
          relatedSubjectType: 'timeline_scene',
          relatedSubjectId: assetId,
        });
      }
    }

    if (chapterDurations.length >= 2) {
      const max = Math.max(...chapterDurations);
      const min = Math.min(...chapterDurations.filter((n) => n > 0));
      if (min > 0 && max / min >= CHAPTER_BALANCE_RATIO) {
        pushFinding(findings, {
          id: findingId('unbalanced_chapters'),
          code: 'unbalanced_chapters',
          severity: 'suggestion',
          status: 'open',
          labelKey: labelKeyFor('unbalanced_chapters'),
          detail: `chapters=${chapterCount}`,
          evidenceState: 'observed',
          requiresHumanConfirmation: false,
          confirmationClearsActive: false,
        });
      }
    }
  }

  for (const dup of input.duplicatePairs) {
    if (dup.reviewState !== 'unreviewed') {
      continue;
    }
    pushFinding(findings, {
      id: findingId('unreviewed_duplicate_assets', dup.pairId),
      code: 'unreviewed_duplicate_assets',
      severity: 'suggestion',
      status: 'open',
      labelKey: labelKeyFor('unreviewed_duplicate_assets'),
      evidenceState: 'observed',
      requiresHumanConfirmation: true,
      confirmationClearsActive: true,
      relatedSubjectType: 'duplicate_pair',
      relatedSubjectId: dup.pairId,
    });
  }

  // --- People / cropped faces (never invent faces without consent + observations) ---
  const peopleAvailable = peopleObservationsAvailable({
    peopleConsentActive: input.peopleConsentActive,
    peopleObservations: input.peopleObservations,
  });
  const filmAssetIds = timelineMediaAssetIds(timeline);

  if (!peopleAvailable) {
    pushFinding(findings, {
      id: findingId('cropped_faces_deferred'),
      code: 'cropped_faces_deferred',
      severity: 'warning',
      status: 'open',
      labelKey: labelKeyFor('cropped_faces_deferred'),
      evidenceState: 'deferred',
      requiresHumanConfirmation: false,
      confirmationClearsActive: false,
      relatedSubjectType: 'people',
      relatedSubjectId: 'deferred',
    });
  } else {
    const cropCount = countCroppedFaceSignals(input.peopleObservations);
    const nearEdgeCount = countFaceNearEdgeSignals(input.peopleObservations);
    const unconfirmedInFilm = countUnconfirmedPeopleInFilm(input.peopleObservations, filmAssetIds);
    const filmApprovedMissing = countFilmApprovedPersonMissing(input.peopleProfiles, filmAssetIds);

    if (cropCount > 0) {
      pushFinding(findings, {
        id: findingId('cropped_faces'),
        code: 'cropped_faces',
        severity: 'warning',
        status: 'open',
        labelKey: labelKeyFor('cropped_faces'),
        detail: `count=${cropCount}`,
        evidenceState: 'observed',
        requiresHumanConfirmation: true,
        confirmationClearsActive: true,
        relatedSubjectType: 'people',
        relatedSubjectId: 'crops',
      });
    }
    if (nearEdgeCount > 0) {
      pushFinding(findings, {
        id: findingId('face_near_edge'),
        code: 'face_near_edge',
        severity: 'warning',
        status: 'open',
        labelKey: labelKeyFor('face_near_edge'),
        detail: `count=${nearEdgeCount}`,
        evidenceState: 'observed',
        requiresHumanConfirmation: true,
        confirmationClearsActive: true,
        relatedSubjectType: 'people',
        relatedSubjectId: 'near_edge',
      });
    }
    if (unconfirmedInFilm > 0) {
      pushFinding(findings, {
        id: findingId('unconfirmed_people_in_film'),
        code: 'unconfirmed_people_in_film',
        severity: 'needs_confirmation',
        status: 'open',
        labelKey: labelKeyFor('unconfirmed_people_in_film'),
        detail: `count=${unconfirmedInFilm}`,
        evidenceState: 'observed',
        requiresHumanConfirmation: true,
        confirmationClearsActive: true,
        relatedSubjectType: 'people',
        relatedSubjectId: 'unconfirmed',
      });
    }
    if (filmApprovedMissing > 0) {
      pushFinding(findings, {
        id: findingId('film_approved_person_missing'),
        code: 'film_approved_person_missing',
        severity: 'suggestion',
        status: 'open',
        labelKey: labelKeyFor('film_approved_person_missing'),
        detail: `count=${filmApprovedMissing}`,
        evidenceState: 'observed',
        requiresHumanConfirmation: true,
        confirmationClearsActive: true,
        relatedSubjectType: 'people',
        relatedSubjectId: 'film_missing',
      });
    }
  }

  // --- Asset quality (black frames / resolution) ---
  const blackFrameCount = input.qualityObservations.filter((q) => q.code === 'black_frames' || q.code === 'near_black').length;
  if (blackFrameCount > 0) {
    pushFinding(findings, {
      id: findingId('black_frames'),
      code: 'black_frames',
      severity: 'warning',
      status: 'open',
      labelKey: labelKeyFor('black_frames'),
      detail: `count=${blackFrameCount}`,
      evidenceState: 'observed',
      requiresHumanConfirmation: false,
      confirmationClearsActive: false,
      relatedSubjectType: 'asset_quality',
      relatedSubjectId: 'black_frames',
    });
  }
  const lowResCount = input.qualityObservations.filter((q) => q.code === 'low_resolution').length;
  if (lowResCount > 0) {
    pushFinding(findings, {
      id: findingId('low_resolution_media'),
      code: 'low_resolution_media',
      severity: 'warning',
      status: 'open',
      labelKey: labelKeyFor('low_resolution_media'),
      detail: `count=${lowResCount}`,
      evidenceState: 'observed',
      requiresHumanConfirmation: false,
      confirmationClearsActive: false,
      relatedSubjectType: 'asset_quality',
      relatedSubjectId: 'low_resolution',
    });
  }

  // --- Audio / rights / subtitles ---
  const mix = input.audioMix ?? timeline?.audio ?? null;
  const hasMusicCue = Boolean(timeline?.music);
  const musicTracks = mix?.tracks.filter((track) => track.kind === 'music') ?? [];
  const speechTracks = mix?.tracks.filter((track) => track.kind === 'speech' || track.kind === 'narration') ?? [];
  const hasSpeechClips = speechTracks.some((track) => track.clips.length > 0);

  if (hasMusicCue || musicTracks.length > 0) {
    const mixRightsOk =
      musicTracks.length > 0 &&
      musicTracks.every(
        (track) =>
          track.licensed ||
          (track.rights &&
            (track.rights.source === 'catalog_licensed' ||
              (track.rights.source === 'synthetic_rights_declared' && track.rights.syntheticOrRightsCleared))),
      );
    const rightsOk = input.musicRightsAccepted || mixRightsOk;
    if (!rightsOk) {
      pushFinding(findings, {
        id: findingId('audio_rights_unknown'),
        code: 'audio_rights_unknown',
        severity: 'blocking',
        status: 'open',
        labelKey: labelKeyFor('audio_rights_unknown'),
        evidenceState: 'observed',
        requiresHumanConfirmation: true,
        confirmationClearsActive: false,
        relatedSubjectType: 'audio_mix',
        relatedSubjectId: 'music_rights',
      });
      pushFinding(findings, {
        id: findingId('copyright_music_risk'),
        code: 'copyright_music_risk',
        severity: 'blocking',
        status: 'open',
        labelKey: labelKeyFor('copyright_music_risk'),
        evidenceState: 'observed',
        requiresHumanConfirmation: true,
        confirmationClearsActive: false,
        relatedSubjectType: 'audio_mix',
        relatedSubjectId: 'copyright',
      });
    }
  }

  if (
    input.catalogMusicLicenseStatuses.some((status) => status === 'development_only') &&
    (hasMusicCue || musicTracks.length > 0)
  ) {
    pushFinding(findings, {
      id: findingId('music_catalog_pending_approval'),
      code: 'music_catalog_pending_approval',
      severity: 'blocking',
      status: 'open',
      labelKey: labelKeyFor('music_catalog_pending_approval'),
      evidenceState: 'observed',
      requiresHumanConfirmation: false,
      confirmationClearsActive: false,
      relatedSubjectType: 'audio_mix',
      relatedSubjectId: 'catalog_license',
    });
  }

  if (input.outputQc?.failures.includes('audio_missing')) {
    pushFinding(findings, {
      id: findingId('audio_missing'),
      code: 'audio_missing',
      severity: 'blocking',
      status: 'open',
      labelKey: labelKeyFor('audio_missing'),
      evidenceState: 'composed',
      requiresHumanConfirmation: false,
      confirmationClearsActive: false,
      relatedSubjectType: 'output_qc',
      relatedSubjectId: 'audio',
    });
  }

  if (hasSpeechClips && mix && mix.ducking.enabled && mix.ducking.regions.length === 0) {
    pushFinding(findings, {
      id: findingId('audio_ducking_gap'),
      code: 'audio_ducking_gap',
      severity: 'suggestion',
      status: 'open',
      labelKey: labelKeyFor('audio_ducking_gap'),
      evidenceState: 'observed',
      requiresHumanConfirmation: false,
      confirmationClearsActive: false,
      relatedSubjectType: 'audio_mix',
      relatedSubjectId: 'ducking',
    });
  }

  if (hasSpeechClips) {
    const attached = mix?.subtitles.some((track) => track.attached && track.cues.length > 0) ?? false;
    if (!attached) {
      pushFinding(findings, {
        id: findingId('subtitle_incomplete'),
        code: 'subtitle_incomplete',
        severity: 'warning',
        status: 'open',
        labelKey: labelKeyFor('subtitle_incomplete'),
        evidenceState: 'observed',
        requiresHumanConfirmation: true,
        confirmationClearsActive: true,
        relatedSubjectType: 'audio_mix',
        relatedSubjectId: 'subtitles',
      });
    }
  }

  // --- Sensitive imagery / private info (no invented moderation) ---
  const sensitiveCount = countAllowlistedSensitiveImagery(input.sensitiveImageryCodes);
  if (sensitiveCount > 0) {
    pushFinding(findings, {
      id: findingId('sensitive_imagery'),
      code: 'sensitive_imagery',
      severity: 'needs_confirmation',
      status: 'open',
      labelKey: labelKeyFor('sensitive_imagery'),
      detail: `count=${sensitiveCount}`,
      evidenceState: 'observed',
      requiresHumanConfirmation: true,
      confirmationClearsActive: true,
      relatedSubjectType: 'asset_quality',
      relatedSubjectId: 'sensitive',
    });
  } else {
    pushFinding(findings, {
      id: findingId('sensitive_imagery_deferred'),
      code: 'sensitive_imagery_deferred',
      severity: 'suggestion',
      status: 'open',
      labelKey: labelKeyFor('sensitive_imagery_deferred'),
      evidenceState: 'deferred',
      requiresHumanConfirmation: false,
      confirmationClearsActive: false,
      relatedSubjectType: 'asset_quality',
      relatedSubjectId: 'sensitive_deferred',
    });
  }

  const privateInfoCount = countAllowlistedPrivateInfo(input.privateInfoSignalKinds);
  if (privateInfoCount > 0) {
    pushFinding(findings, {
      id: findingId('private_info_exposure'),
      code: 'private_info_exposure',
      severity: 'needs_confirmation',
      status: 'open',
      labelKey: labelKeyFor('private_info_exposure'),
      detail: `count=${privateInfoCount}`,
      evidenceState: 'observed',
      requiresHumanConfirmation: true,
      confirmationClearsActive: true,
    });
  } else {
    pushFinding(findings, {
      id: findingId('private_info_deferred'),
      code: 'private_info_deferred',
      severity: 'suggestion',
      status: 'open',
      labelKey: labelKeyFor('private_info_deferred'),
      evidenceState: 'deferred',
      requiresHumanConfirmation: false,
      confirmationClearsActive: false,
    });
  }

  if (input.openCollaborationTaskCount > 0) {
    pushFinding(findings, {
      id: findingId('open_collaboration_tasks'),
      code: 'open_collaboration_tasks',
      severity: 'warning',
      status: 'open',
      labelKey: labelKeyFor('open_collaboration_tasks'),
      detail: `count=${input.openCollaborationTaskCount}`,
      evidenceState: 'observed',
      requiresHumanConfirmation: true,
      confirmationClearsActive: true,
      relatedSubjectType: 'collaboration_task',
      relatedSubjectId: 'open',
    });
  }

  const confirmationByFinding = new Map(
    input.confirmations.map((item) => [item.findingId, item] as const),
  );
  const applied = findings.map((finding) => applyConfirmation(finding, confirmationByFinding.get(finding.id)));

  const blockingCount = applied.filter((f) => f.severity === 'blocking').length;
  const warningCount = applied.filter((f) => f.severity === 'warning').length;
  const suggestionCount = applied.filter((f) => f.severity === 'suggestion').length;
  const confirmationCount = applied.filter((f) => f.severity === 'needs_confirmation').length;
  const activeBlockingCount = countActiveBlocking(applied);

  const inputHash = hashReadinessInputs(input, applied);

  return ceremonyReadinessReportSchema.parse({
    schemaVersion: 1,
    id: input.reportId,
    version: 0,
    inputHash,
    findings: applied,
    blockingCount,
    warningCount,
    suggestionCount,
    confirmationCount,
    activeBlockingCount,
    singleScoreInsufficient: true,
    packPolicy: 'block_on_active_blocking',
    downloadPolicy: 'warn_on_active_blocking',
    checklistPolicy: 'always_allowed_for_owner',
    provenance: CEREMONY_READINESS_ENGINE,
  });
}

function applyConfirmation(
  finding: CeremonyReadinessFinding,
  confirmation: CeremonyReadinessConfirmation | undefined,
): CeremonyReadinessFinding {
  if (!confirmation) {
    return finding;
  }
  const status = confirmation.outcome === 'confirm' ? 'confirmed' : 'acknowledged';
  return { ...finding, status };
}

/** True blockers stay active unless confirmationClearsActive and family confirmed/acknowledged. */
export function countActiveBlocking(findings: readonly CeremonyReadinessFinding[]): number {
  return findings.filter((finding) => {
    if (finding.severity !== 'blocking') {
      return false;
    }
    if (finding.status === 'resolved') {
      return false;
    }
    if (
      finding.confirmationClearsActive &&
      (finding.status === 'confirmed' || finding.status === 'acknowledged')
    ) {
      return false;
    }
    // Confirmations never auto-clear hard blockers (confirmationClearsActive=false).
    if (finding.status === 'confirmed' || finding.status === 'acknowledged') {
      return !finding.confirmationClearsActive;
    }
    return finding.status === 'open';
  }).length;
}

export function isFindingActivelyBlocking(finding: CeremonyReadinessFinding): boolean {
  return countActiveBlocking([finding]) === 1;
}

/**
 * Ceremony Pack ZIP policy: block when any active blocking finding remains.
 * Checklist-only downloads stay allowed. Final MP4 download warns in UI only.
 */
export function canProceedWithCeremonyPack(report: CeremonyReadinessReport): {
  allowed: boolean;
  reason: 'ok' | 'readiness_blocking';
  activeBlockingCount: number;
} {
  if (report.activeBlockingCount > 0) {
    return {
      allowed: false,
      reason: 'readiness_blocking',
      activeBlockingCount: report.activeBlockingCount,
    };
  }
  return { allowed: true, reason: 'ok', activeBlockingCount: 0 };
}

export function shouldWarnFinalDownload(report: CeremonyReadinessReport): boolean {
  return report.activeBlockingCount > 0;
}

export function planCeremonyReadinessConfirmation(input: {
  finding: CeremonyReadinessFinding;
  outcome: 'confirm' | 'acknowledge';
  confirmationId: string;
}):
  | { ok: true; confirmation: CeremonyReadinessConfirmation; nextFinding: CeremonyReadinessFinding }
  | { ok: false; reason: 'not_confirmable' | 'hard_blocker' } {
  if (!input.finding.requiresHumanConfirmation && input.finding.severity !== 'needs_confirmation') {
    if (!input.finding.confirmationClearsActive && input.finding.severity === 'blocking') {
      return { ok: false, reason: 'hard_blocker' };
    }
    // Allow acknowledge on warnings that opted into confirmation.
    if (!input.finding.requiresHumanConfirmation) {
      return { ok: false, reason: 'not_confirmable' };
    }
  }
  const confirmation = {
    schemaVersion: 1 as const,
    id: input.confirmationId,
    findingId: input.finding.id,
    findingCode: input.finding.code,
    outcome: input.outcome,
    decidedByFamily: true as const,
    summaryKey:
      input.outcome === 'confirm' ? 'readiness.confirmation.confirm' : 'readiness.confirmation.acknowledge',
    version: 0,
  };
  const nextFinding = applyConfirmation(input.finding, confirmation);
  return { ok: true, confirmation, nextFinding };
}

function hashReadinessInputs(
  input: CeremonyReadinessEvaluateInput,
  findings: readonly CeremonyReadinessFinding[],
): string {
  const payload = JSON.stringify({
    timelineSeed: input.timeline?.seed ?? null,
    sceneCount: input.timeline?.scenes.length ?? 0,
    sceneIds: input.timeline?.scenes.map((s) => s.id) ?? [],
    outputReady: input.outputQc?.ready ?? null,
    outputFailures: input.outputQc?.failures ?? [],
    finalRenderReady: input.finalRenderReady,
    finalOutputVerified: input.finalOutputVerified,
    conflictIds: input.storyConflicts.map((c) => c.id),
    dupIds: input.duplicatePairs.map((d) => d.pairId),
    qualityCodes: input.qualityObservations.map((q) => q.code),
    peopleConsent: input.peopleConsentActive,
    peopleObs: input.peopleObservations.map((o) => o.observationId),
    peopleProfiles: input.peopleProfiles.map((p) => `${p.personId}:${p.approvedForFilm ? 1 : 0}`),
    openTasks: input.openCollaborationTaskCount,
    musicRights: input.musicRightsAccepted,
    mixTracks: input.audioMix?.tracks.map((t) => t.id) ?? [],
    sensitive: input.sensitiveImageryCodes,
    privateInfo: input.privateInfoSignalKinds,
    entitlement: input.includesCeremonyPackEntitlement,
    confirmationIds: input.confirmations.map((c) => `${c.findingId}:${c.outcome}`),
    findingCodes: findings.map((f) => `${f.code}:${f.status}`),
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}
