/**
 * Prompt 19 — transactional email action URL stubs.
 * Path-only opaque segments; never embed emails, names, or plaintext secrets in the URL.
 */

export const TRANSACTIONAL_ACTION_KINDS = [
  'family_invite',
  'contributor_invite',
  'private_screening',
] as const;

export type TransactionalActionKind = (typeof TRANSACTIONAL_ACTION_KINDS)[number];

const ACTION_PATH: Record<TransactionalActionKind, string> = {
  family_invite: '/accept-invite',
  contributor_invite: '/contribute',
  private_screening: '/review',
};

export function buildTransactionalActionUrl(input: {
  appBaseUrl: string;
  kind: TransactionalActionKind;
  /** Opaque path segment only — invite/share token hash fragment, never an email. */
  opaqueSegment: string;
}): string | { error: 'invalid_base' | 'invalid_segment' } {
  const base = input.appBaseUrl.trim().replace(/\/$/, '');
  if (!/^https?:\/\/[^\s]+$/i.test(base)) {
    return { error: 'invalid_base' };
  }
  const segment = input.opaqueSegment.trim();
  if (segment.length < 8 || segment.length > 200 || /[/?#\s@]/.test(segment)) {
    return { error: 'invalid_segment' };
  }
  return `${base}${ACTION_PATH[input.kind]}/${encodeURIComponent(segment)}`;
}

export function appendActionUrlToEmailBody(body: string, actionUrl: string): string {
  const trimmed = body.trimEnd();
  if (trimmed.includes(actionUrl)) {
    return trimmed;
  }
  return `${trimmed}\n\n${actionUrl}`;
}
