import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('creator collab inbox + placement confirm→patch', () => {
  let cwd: string;
  let dataRoot: string;

  beforeEach(() => {
    dataRoot = mkdtempSync(path.join(tmpdir(), 'mv-creator-collab-'));
    cwd = process.cwd();
    process.chdir(dataRoot);
    vi.resetModules();
    process.env.APP_ENV = 'local';
    process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3002';
  });

  afterEach(() => {
    process.chdir(cwd);
    rmSync(dataRoot, { recursive: true, force: true });
    vi.resetModules();
  });

  async function tributeWithTimelineAndContributor() {
    const store = await import('./store');
    const created = await store.createTribute({ displayName: 'Collab Family' });
    for (const title of ['One', 'Two', 'Three']) {
      await store.addMemory(created.publicId, {
        title,
        imagePath: '/fixtures/sample.png',
        alreadyReady: true,
      });
    }
    let stage = await store.advanceFirstFilm(created.publicId);
    for (let i = 0; i < 8 && stage.ok && stage.tribute.firstFilmStage !== 'ready_to_review'; i++) {
      stage = await store.advanceFirstFilm(created.publicId);
    }
    expect(stage.ok).toBe(true);

    const contributor = await store.addMemory(created.publicId, {
      title: 'From Aunt',
      imagePath: '/fixtures/memory-d.png',
      alreadyReady: true,
      source: 'contributor',
      contributorName: 'Aunt',
      reviewState: 'pending',
    });
    expect(contributor).not.toBeNull();
    return { publicId: created.publicId, assetId: contributor!.id };
  }

  it('proposes placement without mutating timeline (changeTimeline false)', async () => {
    const { publicId, assetId } = await tributeWithTimelineAndContributor();
    const store = await import('./store');
    const before = await store.getTribute(publicId);
    const beforeHash = before?.timeline
      ? (await import('@memorialvideo/domain')).hashTimeline(
          (await import('@memorialvideo/contracts')).parseTimelineContract(before.timeline),
        )
      : null;

    const collab = await import('./collaboration-local');
    const proposed = await collab.proposePlacementForContributorAsset({ publicId, assetId });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    const after = await store.getTribute(publicId);
    expect(after?.placementSuggestions).toHaveLength(1);
    expect(after?.placementSuggestions[0]?.status).toBe('proposed');
    expect(after?.placementSuggestions[0]?.changeTimeline).toBe(false);
    expect(after?.collaborationTasks.some((t) => t.kind === 'confirm_placement')).toBe(true);

    const afterHash = after?.timeline
      ? (await import('@memorialvideo/domain')).hashTimeline(
          (await import('@memorialvideo/contracts')).parseTimelineContract(after.timeline),
        )
      : null;
    expect(afterHash).toBe(beforeHash);

    const overview = await collab.loadOwnerCollaboration(publicId);
    expect('error' in overview).toBe(false);
    if ('error' in overview) return;
    expect(overview.changeTimeline).toBe(false);
    expect(overview.inbox.some((item) => item.kind === 'placement_suggestion')).toBe(true);
    expect(overview.summary.generativeUnavailable).toBe(true);
  });

  it('preview → apply insert_scene → reload persists → revert restores', async () => {
    const { publicId, assetId } = await tributeWithTimelineAndContributor();
    const collab = await import('./collaboration-local');
    const store = await import('./store');
    const { parseTimelineContract } = await import('@memorialvideo/contracts');
    const { hashTimeline } = await import('@memorialvideo/domain');

    const proposed = await collab.proposePlacementForContributorAsset({ publicId, assetId });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    const before = await store.getTribute(publicId);
    const beforeTimeline = parseTimelineContract(before!.timeline!);
    const beforeHash = hashTimeline(beforeTimeline);
    const beforeSceneCount = beforeTimeline.scenes.length;

    const preview = await collab.previewOwnerPlacementPatch(publicId, {
      suggestionId: proposed.suggestionId,
    });
    expect('error' in preview).toBe(false);
    if ('error' in preview) return;
    expect(preview.changeTimeline).toBe(false);
    expect(preview.afterDurationFrames).toBeGreaterThan(preview.beforeDurationFrames);
    expect(preview.familyMustConfirm).toBe(true);

    const applied = await collab.applyOwnerPlacementPatch(publicId, {
      suggestionId: proposed.suggestionId,
    });
    expect('error' in applied).toBe(false);
    if ('error' in applied) return;
    expect(applied.changeTimeline).toBe(true);
    expect(applied.decidedByFamily).toBe(true);
    expect(applied.applyStatus).toBe('applied');

    const mid = await store.getTribute(publicId);
    expect(mid?.timelineVersion).toBeGreaterThan(before!.timelineVersion);
    const midTimeline = parseTimelineContract(mid!.timeline!);
    expect(midTimeline.scenes.length).toBe(beforeSceneCount + 1);
    expect(
      midTimeline.scenes.some(
        (scene) =>
          (scene.type === 'image' || scene.type === 'video') && scene.asset.assetId === assetId,
      ),
    ).toBe(true);
    expect(mid?.placementSuggestions[0]?.status).toBe('confirmed');
    expect(mid?.collaborationDecisions.some((d) => d.kind === 'placement' && d.decidedByFamily)).toBe(
      true,
    );

    const reverted = await collab.revertOwnerPlacementPatch(publicId, {
      suggestionId: proposed.suggestionId,
    });
    expect('error' in reverted).toBe(false);
    if ('error' in reverted) return;
    expect(reverted.applyStatus).toBe('reverted');

    const end = await store.getTribute(publicId);
    const endTimeline = parseTimelineContract(end!.timeline!);
    expect(hashTimeline(endTimeline)).toBe(beforeHash);
    expect(
      endTimeline.scenes.some(
        (scene) =>
          (scene.type === 'image' || scene.type === 'video') && scene.asset.assetId === assetId,
      ),
    ).toBe(false);
  });

  it('dismisses placement via family decision without applying patch', async () => {
    const { publicId, assetId } = await tributeWithTimelineAndContributor();
    const collab = await import('./collaboration-local');
    const store = await import('./store');

    const proposed = await collab.proposePlacementForContributorAsset({ publicId, assetId });
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    const dismissed = await collab.recordOwnerCollaborationDecision({
      publicId,
      kind: 'placement',
      outcome: 'dismiss',
      subjectType: 'placement_suggestion',
      subjectId: proposed.suggestionId,
      summaryKey: 'collab.decision.dismiss',
    });
    expect('error' in dismissed).toBe(false);
    if ('error' in dismissed) return;
    expect(dismissed.decision.decidedByFamily).toBe(true);

    const tribute = await store.getTribute(publicId);
    expect(tribute?.placementSuggestions[0]?.status).toBe('dismissed');
    expect(
      tribute?.collaborationTasks.find((t) => t.subjectId === proposed.suggestionId)?.status,
    ).toBe('done');

    const overview = await collab.loadOwnerCollaboration(publicId);
    if ('error' in overview) return;
    expect(overview.inbox.some((item) => item.subjectId === proposed.suggestionId)).toBe(false);
  });

  it('records final film approval with decidedByFamily', async () => {
    const store = await import('./store');
    const created = await store.createTribute({ displayName: 'Approval Only' });
    const collab = await import('./collaboration-local');
    const recorded = await collab.recordOwnerCollaborationDecision({
      publicId: created.publicId,
      kind: 'approval',
      outcome: 'approve',
      subjectType: 'final_film',
      subjectId: 'film',
      summaryKey: 'collab.decision.approve',
    });
    expect('error' in recorded).toBe(false);
    if ('error' in recorded) return;
    expect(recorded.overview.activeFinalApproval?.outcome).toBe('approve');
    expect(recorded.decision.decidedByFamily).toBe(true);
  });
});
