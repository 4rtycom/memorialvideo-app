import type { PackageKey } from '@memorialvideo/contracts';

export type EntitlementPolicy = {
  packageKey: PackageKey;
  maxFinalRenders: number;
  retentionDays: number;
  includesCeremonyPack: boolean;
  allowsPrivatePlayback: boolean;
  /** Customer-facing Memorial Pack offer (primary commercial SKU). */
  isMemorialPack: boolean;
};

/**
 * Customer-facing Memorial Pack maps to internal package key `ceremony`.
 * Do not scatter this mapping in React — import from domain / lib/entitlements.
 */
export const MEMORIAL_PACK_PACKAGE_KEY: PackageKey = 'ceremony';

export const PACKAGE_POLICIES: Record<PackageKey, EntitlementPolicy> = {
  preview: {
    packageKey: 'preview',
    maxFinalRenders: 0,
    retentionDays: 30,
    includesCeremonyPack: false,
    allowsPrivatePlayback: false,
    isMemorialPack: false,
  },
  tribute: {
    packageKey: 'tribute',
    maxFinalRenders: 2,
    retentionDays: 30,
    includesCeremonyPack: false,
    allowsPrivatePlayback: false,
    isMemorialPack: false,
  },
  ceremony: {
    packageKey: 'ceremony',
    maxFinalRenders: 3,
    retentionDays: 90,
    includesCeremonyPack: true,
    allowsPrivatePlayback: true,
    isMemorialPack: true,
  },
  legacy: {
    packageKey: 'legacy',
    maxFinalRenders: 5,
    retentionDays: 365,
    includesCeremonyPack: true,
    allowsPrivatePlayback: true,
    isMemorialPack: false,
  },
};

export function memorialPackPolicy(): EntitlementPolicy {
  return PACKAGE_POLICIES[MEMORIAL_PACK_PACKAGE_KEY];
}

export function isMemorialPackPackage(packageKey: PackageKey): boolean {
  return PACKAGE_POLICIES[packageKey]?.isMemorialPack === true;
}

export function canStartFinalRender(input: {
  packageKey: PackageKey;
  finalRendersUsed: number;
  isTechnicalRetry: boolean;
}): boolean {
  const policy = PACKAGE_POLICIES[input.packageKey];
  if (!policy || policy.maxFinalRenders === 0) {
    return false;
  }
  if (input.isTechnicalRetry) {
    return input.finalRendersUsed <= policy.maxFinalRenders;
  }
  return input.finalRendersUsed < policy.maxFinalRenders;
}

export function entitlementAllowsCeremonyPack(features: { ceremony_pack?: unknown } | null | undefined): boolean {
  return features?.ceremony_pack === true;
}

export function entitlementAllowsPrivatePlayback(features: {
  private_playback?: unknown;
} | null | undefined): boolean {
  return features?.private_playback === true;
}
