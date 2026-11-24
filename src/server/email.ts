import { creatorEnv } from './env';

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type EmailResult = { ok: true } | { ok: false; reason: 'not_configured' | 'send_failed' };

export function isEmailConfigured(env = creatorEnv()): boolean {
  return Boolean(env.EMAIL_PROVIDER_API_KEY && env.EMAIL_FROM);
}

/**
 * Send one transactional email.
 * Provider: Resend by default, or Postmark with EMAIL_PROVIDER=postmark.
 * Needs EMAIL_PROVIDER_API_KEY and EMAIL_FROM. Addresses and message bodies are never logged.
 */
export async function sendEmail(
  message: EmailMessage,
  deps: { fetchFn?: typeof fetch } = {},
): Promise<EmailResult> {
  const env = creatorEnv();
  if (!env.EMAIL_PROVIDER_API_KEY || !env.EMAIL_FROM) {
    return { ok: false, reason: 'not_configured' };
  }
  const fetchFn = deps.fetchFn ?? fetch;
  const provider = (process.env.EMAIL_PROVIDER ?? 'resend').trim().toLowerCase();
  try {
    const response =
      provider === 'postmark'
        ? await fetchFn('https://api.postmarkapp.com/email', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'X-Postmark-Server-Token': env.EMAIL_PROVIDER_API_KEY,
            },
            body: JSON.stringify({
              From: env.EMAIL_FROM,
              To: message.to,
              Subject: message.subject,
              TextBody: message.text,
              HtmlBody: message.html,
              MessageStream: 'outbound',
            }),
          })
        : await fetchFn('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${env.EMAIL_PROVIDER_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: env.EMAIL_FROM,
              to: [message.to],
              subject: message.subject,
              text: message.text,
              html: message.html,
            }),
          });
    return response.ok ? { ok: true } : { ok: false, reason: 'send_failed' };
  } catch {
    return { ok: false, reason: 'send_failed' };
  }
}
