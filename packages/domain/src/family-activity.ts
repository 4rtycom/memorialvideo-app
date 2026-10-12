/**
 * Prompt 19 — family-friendly activity (never raw technical audit dumps).
 */

export type FamilyActivityKind =
  | 'tribute_created'
  | 'memory_added'
  | 'memory_ready'
  | 'contributor_invited'
  | 'collection_reminded'
  | 'story_updated'
  | 'film_arranged'
  | 'render_queued'
  | 'ceremony_pack'
  | 'collaboration_decision'
  | 'other';

export type FamilyActivityItem = {
  id: string;
  kind: FamilyActivityKind;
  /** i18n key under activity.* */
  labelKey: `activity.${FamilyActivityKind}`;
  occurredAt: string;
};

const ACTION_MAP: Record<string, FamilyActivityKind> = {
  'project.created': 'tribute_created',
  'asset.upload_completed': 'memory_added',
  'asset.variants_ready': 'memory_ready',
  'invite.created': 'contributor_invited',
  'collection.reminded': 'collection_reminded',
  'story.fact_confirmed': 'story_updated',
  'story.plan_approved': 'story_updated',
  'story.chapter_created': 'story_updated',
  'director.patch_applied': 'film_arranged',
  'director.plan_ready': 'film_arranged',
  'render.job_queued': 'render_queued',
  'ceremony.pack_built': 'ceremony_pack',
  'collaboration.decision_recorded': 'collaboration_decision',
  'collaboration.placement_confirmed': 'collaboration_decision',
};

export function mapAuditActionToFamilyActivity(actionKey: string): FamilyActivityKind {
  return ACTION_MAP[actionKey] ?? 'other';
}

export function buildFamilyActivityFeed(
  rows: ReadonlyArray<{ id: string; actionKey: string; createdAt: string }>,
  limit = 40,
): FamilyActivityItem[] {
  return rows
    .map((row) => {
      const kind = mapAuditActionToFamilyActivity(row.actionKey);
      return {
        id: row.id,
        kind,
        labelKey: `activity.${kind}` as const,
        occurredAt: row.createdAt,
      };
    })
    .filter((item) => item.kind !== 'other')
    .slice(0, limit);
}

export type ContributionHistoryItem = {
  assetId: string;
  source: 'owner' | 'contributor';
  status: string;
  createdAt: string;
};

export function summarizeContributionHistory(
  assets: ReadonlyArray<{
    id: string;
    contributorId: string | null;
    status: string;
    createdAt: string;
    deletedAt: string | null;
  }>,
): ContributionHistoryItem[] {
  return assets
    .filter((asset) => !asset.deletedAt)
    .map((asset) => ({
      assetId: asset.id,
      source: asset.contributorId ? ('contributor' as const) : ('owner' as const),
      status: asset.status,
      createdAt: asset.createdAt,
    }))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
