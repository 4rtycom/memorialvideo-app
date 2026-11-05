import { describe, expect, it } from 'vitest';
import {
  SHARE_SURFACE_PRIORITY,
  ceremonyPackPrecedesPrivateShare,
  shareSurfaceRank,
} from './share-surface-priority';

describe('share surface priority (MV-AUD-013)', () => {
  it('ranks venue pack and handoff ahead of optional private share', () => {
    expect(ceremonyPackPrecedesPrivateShare()).toBe(true);
    expect(shareSurfaceRank('venue_pack')).toBeLessThan(shareSurfaceRank('optional_private_share'));
    expect(shareSurfaceRank('venue_handoff')).toBeLessThan(
      shareSurfaceRank('optional_private_share'),
    );
  });

  it('keeps readiness before venue delivery and purchase after venue pack', () => {
    expect(SHARE_SURFACE_PRIORITY[0]).toBe('readiness');
    expect(shareSurfaceRank('venue_pack')).toBeLessThan(
      shareSurfaceRank('memorial_pack_purchase'),
    );
    expect(SHARE_SURFACE_PRIORITY).toContain('optional_private_share');
  });
});
