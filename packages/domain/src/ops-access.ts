/**
 * Prompt 27 — internal operations access policy (pure rules).
 * Staff inspect metadata/status only. No media URLs. No impersonation.
 */

export const OPS_INSPECT_FIELDS = [
  'projectPublicId',
  'lifecycleStatus',
  'packageKey',
  'paymentStatus',
  'memoryCount',
  'storageBytes',
  'renderCounts',
  'failedJobCount',
  'inviteState',
  'shareActiveCount',
  'usageWindow',
  'finishCounts',
] as const;

export type OpsSafeAction = 'inspect_project' | 'inspect_jobs' | 'inspect_health' | 'retry_render';
export type OpsDangerousAction = 'revoke_share';

export type OpsAction = OpsSafeAction | OpsDangerousAction;

export const OPS_DANGEROUS_ACTIONS: readonly OpsDangerousAction[] = ['revoke_share'];

export const OPS_REVOKE_CONFIRMATION = 'REVOKE_SHARE';

export type OpsActorAuthInput = {
  configuredToken: string | undefined;
  presentedToken: string | undefined;
};

export function authorizeOpsToken(input: OpsActorAuthInput): { ok: true } | { ok: false; reason: 'unavailable' | 'unauthorized' } {
  const configured = input.configuredToken?.trim() ?? '';
  if (configured.length < 32) {
    return { ok: false, reason: 'unavailable' };
  }
  const presented = input.presentedToken?.trim() ?? '';
  if (!presented || presented !== configured) {
    return { ok: false, reason: 'unauthorized' };
  }
  return { ok: true };
}

export function isDangerousOpsAction(action: OpsAction): action is OpsDangerousAction {
  return (OPS_DANGEROUS_ACTIONS as readonly string[]).includes(action);
}

export function confirmDangerousOpsAction(input: {
  action: OpsAction;
  confirmation: string | undefined;
}): { ok: true } | { ok: false; reason: 'confirmation_required' } {
  if (!isDangerousOpsAction(input.action)) {
    return { ok: true };
  }
  if ((input.confirmation ?? '').trim() !== OPS_REVOKE_CONFIRMATION) {
    return { ok: false, reason: 'confirmation_required' };
  }
  return { ok: true };
}

export type OpsProjectSummary = {
  projectPublicId: string;
  lifecycleStatus: string;
  packageKey: string | null;
  paymentStatus: string | null;
  memoryCount: number;
  storageBytes: number;
  renderCounts: {
    queued: number;
    running: number;
    ready: number;
    failed: number;
  };
  failedJobCount: number;
  inviteState: {
    active: number;
    redeemed: number;
    revoked: number;
  };
  shareActiveCount: number;
  usageWindow: {
    renderAttempts: number;
    enhancements: number;
    intelligenceCalls: number;
  };
  /** Memorial Finish job counts — metadata only, no media/derived URLs. */
  finishCounts: {
    queued: number;
    previewReady: number;
    approved: number;
    failed: number;
  };
};

/** Strip any accidental media/PII fields before returning to ops UI. */
export function sanitizeOpsProjectSummary(input: OpsProjectSummary & Record<string, unknown>): OpsProjectSummary {
  return {
    projectPublicId: input.projectPublicId,
    lifecycleStatus: input.lifecycleStatus,
    packageKey: input.packageKey,
    paymentStatus: input.paymentStatus,
    memoryCount: input.memoryCount,
    storageBytes: input.storageBytes,
    renderCounts: {
      queued: input.renderCounts.queued,
      running: input.renderCounts.running,
      ready: input.renderCounts.ready,
      failed: input.renderCounts.failed,
    },
    failedJobCount: input.failedJobCount,
    inviteState: {
      active: input.inviteState.active,
      redeemed: input.inviteState.redeemed,
      revoked: input.inviteState.revoked,
    },
    shareActiveCount: input.shareActiveCount,
    usageWindow: {
      renderAttempts: input.usageWindow.renderAttempts,
      enhancements: input.usageWindow.enhancements,
      intelligenceCalls: input.usageWindow.intelligenceCalls,
    },
    finishCounts: {
      queued: input.finishCounts.queued,
      previewReady: input.finishCounts.previewReady,
      approved: input.finishCounts.approved,
      failed: input.finishCounts.failed,
    },
  };
}

export type OpsJobSummary = {
  jobId: string;
  projectPublicId: string;
  kind: string;
  status: string;
  errorCode: string | null;
  queuedAt: string | null;
  lastHeartbeatAt: string | null;
};

export function canOpsRetryRender(status: string): boolean {
  return status === 'FAILED_RETRYABLE';
}

export type OpsSystemHealth = {
  appEnv: string;
  signInConfigured: boolean;
  serviceRoleConfigured: boolean;
  databaseConfigured: boolean;
  emailConfigured: boolean;
  stripeConfigured: boolean;
  musicCatalogEnabled: boolean;
  opsTokenConfigured: boolean;
  renderProvider: string;
};
