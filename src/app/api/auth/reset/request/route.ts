import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createPasswordReset, normalizeEmail } from '@/server/accounts';
import { isEmailConfigured, sendEmail } from '@/server/email';
import { creatorEnv, isLocalCreatorEnv } from '@/server/env';
import { allowRequest, clientKey, subjectKey } from '@/server/rate-limit';

export const runtime = 'nodejs';

const bodySchema = z.object({ email: z.string().trim().min(3).max(320) });

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Ask for a password-reset email. The answer is always the same, whether or not an
 * account exists for that address.
 */
export async function POST(request: Request) {
  const accepted = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return accepted;
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return accepted;
  }
  const email = normalizeEmail(parsed.data.email);
  if (
    !allowRequest(`password-reset-ip:${clientKey(request)}`, 5, 15 * 60_000) ||
    !allowRequest(`password-reset-account:${subjectKey(email)}`, 3, 15 * 60_000)
  ) {
    return accepted;
  }
  if (!isEmailConfigured() && !isLocalCreatorEnv()) {
    // Without an email provider nobody could receive the link; do not mint a token.
    return accepted;
  }
  const reset = await createPasswordReset(email);
  if (!reset) {
    return accepted;
  }
  // The token travels in the URL fragment so it never reaches server or proxy logs.
  const link = `${creatorEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/reset#t=${reset.token}`;
  if (!isEmailConfigured()) {
    // Local development only: there is no mailbox, so show the link to the developer.
    console.info(`[local] password reset link: ${link}`);
    return accepted;
  }
  await sendEmail({
    to: email,
    subject: 'Reset your MemorialVideo password',
    text: [
      'We received a request to reset the password for your MemorialVideo account.',
      '',
      `Choose a new password here (the link works once, for 30 minutes):`,
      link,
      '',
      'If you did not ask for this, you can ignore this email. Your password stays the same.',
    ].join('\n'),
    html: `<p>We received a request to reset the password for your MemorialVideo account.</p>
<p><a href="${escapeHtml(link)}">Choose a new password</a><br>The link works once, for 30 minutes.</p>
<p>If you did not ask for this, you can ignore this email. Your password stays the same.</p>`,
  });
  return accepted;
}
