import { describe, expect, it } from 'vitest';

import {
  canStartFinalRender,
  entitlementAllowsCeremonyPack,
  entitlementAllowsPrivatePlayback,
  isMemorialPackPackage,
  MEMORIAL_PACK_PACKAGE_KEY,
  memorialPackPolicy,
} from './entitlement.js';

describe('entitlement gate', () => {
  it('never grants a final render on the free preview package', () => {
    expect(
      canStartFinalRender({ packageKey: 'preview', finalRendersUsed: 0, isTechnicalRetry: false }),
    ).toBe(false);
  });

  it('allows a technical retry without consuming a new customer rerender', () => {
    expect(
      canStartFinalRender({ packageKey: 'tribute', finalRendersUsed: 2, isTechnicalRetry: true }),
    ).toBe(true);
    expect(
      canStartFinalRender({ packageKey: 'tribute', finalRendersUsed: 2, isTechnicalRetry: false }),
    ).toBe(false);
  });

  it('maps Memorial Pack to the ceremony package policy', () => {
    expect(MEMORIAL_PACK_PACKAGE_KEY).toBe('ceremony');
    expect(isMemorialPackPackage('ceremony')).toBe(true);
    expect(isMemorialPackPackage('tribute')).toBe(false);
    const policy = memorialPackPolicy();
    expect(policy.includesCeremonyPack).toBe(true);
    expect(policy.allowsPrivatePlayback).toBe(true);
    expect(policy.maxFinalRenders).toBe(3);
    expect(entitlementAllowsCeremonyPack({ ceremony_pack: true })).toBe(true);
    expect(entitlementAllowsPrivatePlayback({ private_playback: true })).toBe(true);
  });
});
