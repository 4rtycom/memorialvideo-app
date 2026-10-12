import type { LaunchLanguage } from '@memorialvideo/contracts';

import { buildSendableEmail, planEmailDispatch, type EmailDispatchPlan } from './email-send';
import type { EmailTemplate } from './email';

/**
 * Prompt 20 — EmailProvider abstraction.
 * Local uses Mailpit. Production requires an explicit provider key (never invent sends).
 */
export type EmailProviderId = 'mailpit' | 'noop' | 'external';

export type EmailSendRequest = {
  template: EmailTemplate;
  locale: LaunchLanguage;
  recipient: string;
  correlationId: string;
  idempotencyKey: string;
  projectId?: string | null;
  /** Optional click-through stub from `buildTransactionalActionUrl` (Prompt 19). */
  actionUrl?: string;
};

export type EmailSendResult =
  | { ok: true; provider: EmailProviderId; correlationId: string; duplicate: boolean }
  | { ok: false; provider: EmailProviderId; error: string; duplicate: boolean };

export function resolveEmailProvider(plan: EmailDispatchPlan): EmailProviderId {
  if (plan === 'mailpit') {
    return 'mailpit';
  }
  if (plan === 'blocked_production') {
    return 'noop';
  }
  return 'noop';
}

export function notificationIdempotencyKey(input: {
  template: EmailTemplate;
  projectId: string | null | undefined;
  subjectKey: string;
}): string {
  const project = input.projectId ?? 'none';
  return `notify:${input.template}:${project}:${input.subjectKey}`;
}

export function prepareEmailPayload(input: EmailSendRequest): {
  subject: string;
  body: string;
  correlationId: string;
} {
  const built = buildSendableEmail({
    template: input.template,
    locale: input.locale,
    correlationId: input.correlationId,
    actionUrl: input.actionUrl,
  });
  return {
    subject: built.subject,
    body: built.body,
    correlationId: built.correlationId,
  };
}

export { planEmailDispatch };
