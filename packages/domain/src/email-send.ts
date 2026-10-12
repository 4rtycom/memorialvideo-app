import type { LaunchLanguage } from '@memorialvideo/contracts';

import { renderTransactionalEmail, type EmailTemplate } from './email';
import { appendActionUrlToEmailBody } from './email-links';

export type EmailDispatchPlan = 'mailpit' | 'skip_no_provider' | 'blocked_production';

export function planEmailDispatch(input: {
  appEnv: 'local' | 'preview' | 'staging' | 'production';
  hasProviderKey: boolean;
}): EmailDispatchPlan {
  if (input.appEnv === 'production' && !input.hasProviderKey) {
    return 'blocked_production';
  }
  if (input.appEnv === 'local') {
    return 'mailpit';
  }
  if (input.hasProviderKey) {
    return 'skip_no_provider';
  }
  return 'skip_no_provider';
}

export function buildSendableEmail(input: {
  template: EmailTemplate;
  locale: LaunchLanguage;
  correlationId: string;
  /** Optional deep-link stub (Prompt 19); never include PII in the URL. */
  actionUrl?: string;
}): {
  template: EmailTemplate;
  locale: LaunchLanguage;
  correlationId: string;
  subject: string;
  body: string;
} {
  const message = renderTransactionalEmail({ template: input.template, locale: input.locale });
  const body = input.actionUrl ? appendActionUrlToEmailBody(message.body, input.actionUrl) : message.body;
  return {
    template: message.template,
    locale: message.locale,
    correlationId: input.correlationId,
    subject: message.subject,
    body,
  };
}
