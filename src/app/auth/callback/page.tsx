'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createSupabaseBrowser } from '@/lib/supabase/browser';
import Link from 'next/link';

const OTP_TYPES = new Set<EmailOtpType>([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
]);

function otpType(value: string | null): EmailOtpType | null {
  return value && OTP_TYPES.has(value as EmailOtpType) ? (value as EmailOtpType) : null;
}

function safeNext(path: string | null): string {
  if (!path || !path.startsWith('/') || path.startsWith('//')) {
    return '/';
  }
  return path;
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="app-shell">
          <div className="content">
            <p role="status">Completing sign-in…</p>
          </div>
        </main>
      }
    >
      <AuthCallbackClient />
    </Suspense>
  );
}

function AuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void (async () => {
      const client = createSupabaseBrowser();
      if (!client) {
        setFailed(true);
        return;
      }
      const code = searchParams.get('code');
      const tokenHash = searchParams.get('token_hash');
      const type = otpType(searchParams.get('type'));
      let ok = true;
      if (code) {
        const exchanged = await client.auth.exchangeCodeForSession(code);
        ok = !exchanged.error;
      } else if (tokenHash && type) {
        const verified = await client.auth.verifyOtp({ token_hash: tokenHash, type });
        ok = !verified.error;
      } else {
        const session = await client.auth.getSession();
        ok = Boolean(session.data.session) && !session.error;
      }
      if (!ok) {
        setFailed(true);
        return;
      }
      router.replace(next);
    })();
  }, [next, router, searchParams]);

  if (failed) {
    return (
      <main className="app-shell">
        <div className="content">
          <h1 className="hero">We could not finish signing you in.</h1>
          <p className="lede">Your tribute work is still safe. Please try again.</p>
          <Link className="btn btn-primary" href="/sign-in">
            Back to sign-in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="content">
        <p role="status">Completing sign-in…</p>
      </div>
    </main>
  );
}
