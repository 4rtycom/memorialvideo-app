import { describe, expect, it } from 'vitest';

import {
  advanceLocalFinishJob,
  canApplyFinishInFilm,
  canTransitionFinishJob,
  decideFinishReview,
  defaultFinishEffectBudget,
  finishImplementationStatus,
  finishMutatesOriginal,
  planFinishEffectBudget,
  planFinishFilmBinding,
  planFinishJobEnqueue,
  planLocalVideoFinishSpike,
  planMemorialFinish,
  resolveFinishPlaybackSrc,
  summarizeFinishEffectBudget,
  videoRangeSeconds,
} from './memorial-finish';

describe('memorial finish foundation', () => {
  it('plans local deterministic finish only with consent and selections', () => {
    expect(
      planMemorialFinish({
        projectPublicId: 'mv_x',
        selections: [],
        mode: 'restore',
        consentGranted: true,
        externalProvidersAllowed: false,
      }),
    ).toEqual({ ok: false, reason: 'no_selection' });

    expect(
      planMemorialFinish({
        projectPublicId: 'mv_x',
        selections: [{ kind: 'still_asset', assetId: 'a1' }],
        mode: 'refine',
        consentGranted: false,
        externalProvidersAllowed: false,
      }),
    ).toEqual({ ok: false, reason: 'consent_required' });

    expect(
      planMemorialFinish({
        projectPublicId: 'mv_x',
        selections: [{ kind: 'still_asset', assetId: 'a1' }],
        mode: 'restore',
        consentGranted: true,
        externalProvidersAllowed: true,
      }),
    ).toEqual({ ok: false, reason: 'external_blocked' });

    expect(
      planMemorialFinish({
        projectPublicId: 'mv_x',
        selections: [{ kind: 'video_range', assetId: 'v1', startMs: 0, endMs: 2500 }],
        mode: 'stabilize',
        consentGranted: true,
        externalProvidersAllowed: false,
      }),
    ).toMatchObject({
      ok: true,
      providerMode: 'local_deterministic',
      requiresFamilyReview: true,
      mutatesOriginal: false,
    });
  });

  it('keeps job transitions bounded and originals immutable', () => {
    expect(canTransitionFinishJob('queued', 'processing')).toBe(true);
    expect(canTransitionFinishJob('preview_ready', 'approved')).toBe(true);
    expect(canTransitionFinishJob('approved', 'processing')).toBe(false);
    expect(finishMutatesOriginal()).toBe(false);
  });

  it('enqueues local still and video jobs and marks implementation local_ready', () => {
    const plan = planMemorialFinish({
      projectPublicId: 'mv_x',
      selections: [{ kind: 'still_asset', assetId: 'a1' }],
      mode: 'restore',
      consentGranted: true,
      externalProvidersAllowed: false,
    });
    expect(finishImplementationStatus(plan)).toBe('local_ready');
    expect(
      planFinishJobEnqueue({
        plan,
        selection: { kind: 'still_asset', assetId: 'a1' },
      }),
    ).toMatchObject({ ok: true, canProcessLocally: true, status: 'queued' });
    expect(advanceLocalFinishJob({ status: 'queued', canProcessLocally: true })).toBe('processing');
    expect(advanceLocalFinishJob({ status: 'processing', canProcessLocally: true })).toBe('preview_ready');
    expect(
      planFinishJobEnqueue({
        plan,
        selection: { kind: 'video_range', assetId: 'v1', startMs: 0, endMs: 1000 },
      }),
    ).toMatchObject({
      ok: true,
      canProcessLocally: true,
      operations: ['stabilize_metadata', 'stabilize_local_ffmpeg'],
    });
  });

  it('requires family review decisions only from preview_ready', () => {
    expect(decideFinishReview({ status: 'queued', decision: 'approve' })).toEqual({
      ok: false,
      reason: 'not_preview_ready',
    });
    expect(decideFinishReview({ status: 'preview_ready', decision: 'approve' })).toMatchObject({
      ok: true,
      status: 'approved',
      approvedForFilm: false,
      generativeAlteration: false,
    });
    expect(decideFinishReview({ status: 'preview_ready', decision: 'approve_for_film' })).toMatchObject({
      ok: true,
      status: 'approved',
      approvedForFilm: true,
    });
    expect(decideFinishReview({ status: 'preview_ready', decision: 'reject' })).toMatchObject({
      ok: true,
      status: 'rejected',
      approvedForFilm: false,
    });
  });

  it('enforces EffectBudget ceilings and blocks generative requests', () => {
    const budget = defaultFinishEffectBudget('preview');
    expect(budget.generativeOpsAllowed).toBe(false);
    expect(
      planFinishEffectBudget({
        budget,
        jobsToday: 0,
        videoSecondsToday: 0,
        activeJobs: 0,
        newJobCount: 1,
        newVideoSeconds: 10,
        requestsGenerative: false,
      }),
    ).toEqual({ ok: true });
    expect(
      planFinishEffectBudget({
        budget,
        jobsToday: 8,
        videoSecondsToday: 0,
        activeJobs: 0,
        newJobCount: 1,
        newVideoSeconds: 0,
        requestsGenerative: false,
      }),
    ).toEqual({ ok: false, reason: 'jobs_exhausted' });
    expect(
      planFinishEffectBudget({
        budget,
        jobsToday: 0,
        videoSecondsToday: 0,
        activeJobs: 0,
        newJobCount: 1,
        newVideoSeconds: 0,
        requestsGenerative: true,
      }),
    ).toEqual({ ok: false, reason: 'generative_blocked' });
    expect(videoRangeSeconds({ kind: 'video_range', assetId: 'v', startMs: 0, endMs: 2500 })).toBe(3);
  });

  it('summarizes EffectBudget remaining for Finish UI', () => {
    const summary = summarizeFinishEffectBudget({
      packageKey: 'ceremony',
      jobsToday: 10,
      videoSecondsToday: 40,
      activeJobs: 1,
    });
    expect(summary.generativeOpsAllowed).toBe(false);
    expect(summary.limits.maxJobsPerDay).toBe(40);
    expect(summary.remaining.jobs).toBe(30);
    expect(summary.remaining.videoSeconds).toBe(260);
    expect(summary.remaining.concurrentSlots).toBe(3);
  });

  it('plans film binding only for film-approved jobs present in the timeline', () => {
    expect(canApplyFinishInFilm({ status: 'approved', approvedForFilm: true })).toBe(true);
    expect(canApplyFinishInFilm({ status: 'approved', approvedForFilm: false })).toBe(false);
    expect(
      planFinishFilmBinding({
        status: 'approved',
        approvedForFilm: true,
        assetId: 'a1',
        timelineAssetIds: ['a1', 'a2', 'a1'],
      }),
    ).toEqual({
      ok: true,
      matchedSceneCount: 2,
      mutatesOriginal: false,
      changesMediaBytes: false,
      usesDerivedSrc: false,
    });
    expect(
      planFinishFilmBinding({
        status: 'approved',
        approvedForFilm: true,
        assetId: 'a1',
        timelineAssetIds: ['a1'],
        derivedSrc: 'storage://project-variants/projects/p1/assets/a1/variants/finish-fn1.mp4',
      }),
    ).toMatchObject({ ok: true, usesDerivedSrc: true, mutatesOriginal: false });
    expect(
      planFinishFilmBinding({
        status: 'approved',
        approvedForFilm: true,
        assetId: 'missing',
        timelineAssetIds: ['a1'],
      }),
    ).toEqual({ ok: false, reason: 'asset_not_in_timeline' });
  });

  it('resolves Finish playback src for Remotion parity without inventing media', () => {
    const original = 'storage://project-originals/projects/p1/a1.mp4';
    const derived = 'storage://project-variants/projects/p1/assets/a1/variants/finish-fn1.mp4';
    expect(
      resolveFinishPlaybackSrc({ originalSrc: original, finishJobId: 'fn1', derivedSrc: derived }),
    ).toEqual({ src: derived, usesDerived: true, finishJobId: 'fn1' });
    expect(resolveFinishPlaybackSrc({ originalSrc: original, finishJobId: 'fn1' })).toEqual({
      src: original,
      usesDerived: false,
      finishJobId: 'fn1',
    });
    expect(planLocalVideoFinishSpike({ ffmpegAvailable: true })).toMatchObject({
      canProduceDerivedBytes: true,
      generative: false,
      blockedGenerativeRestore: true,
    });
    expect(planLocalVideoFinishSpike({ ffmpegAvailable: false }).canProduceDerivedBytes).toBe(false);
  });
});
