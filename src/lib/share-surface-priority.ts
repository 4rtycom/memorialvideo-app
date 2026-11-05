/**
 * MV-AUD-013 — Ready-for-the-service surface order.
 * Ceremony pack + venue handoff outrank optional private share links.
 */
export const SHARE_SURFACE_PRIORITY = [
  'readiness',
  'venue_pack',
  'venue_handoff',
  'checklist',
  'ceremony_player',
  'memorial_pack_purchase',
  'optional_private_share',
  'render_jobs',
] as const;

export type ShareSurfaceStep = (typeof SHARE_SURFACE_PRIORITY)[number];

export function shareSurfaceRank(step: ShareSurfaceStep): number {
  return SHARE_SURFACE_PRIORITY.indexOf(step);
}

/** True when venue delivery is ranked ahead of optional private share. */
export function ceremonyPackPrecedesPrivateShare(): boolean {
  return shareSurfaceRank('venue_pack') < shareSurfaceRank('optional_private_share');
}
