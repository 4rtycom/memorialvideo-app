'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button, Card, Eyebrow, Hero, Lede } from '@/components/ui';

type SignInState = 'idle' | 'sending' | 'sent' | 'failed';

export function SignInForm({ configured }: { configured: boolean }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<SignInState>('idle');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setState('sending');
    try {
      const response = await fetch('/api/auth/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        setState('failed');
        return;
      }
      setState('sent');
    } catch {
      setState('failed');
    }
  }

  return (
    <>
      <Eyebrow>YOUR ACCOUNT</Eyebrow>
      <Hero>Sign in with a calm magic link.</Hero>
      <Lede>We’ll email a private link. No password to remember on a hard day.</Lede>

      <Card className="!p-7 max-w-xl">
        {!configured ? (
          <p className="text-[color:var(--muted)] m-0" role="status">
            Sign-in is not configured in this environment. Set{' '}
            <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to
            enable magic links. Local tribute work still works without an account.
          </p>
        ) : state === 'sent' ? (
          <p className="m-0" role="status">
            If that address can receive mail, a sign-in link is on its way. You can close this tab.
          </p>
        ) : state === 'failed' ? (
          <div>
            <p className="m-0 mb-4" role="alert">
              We could not send the link. Your work is still safe — please try again.
            </p>
            <Button type="button" onClick={() => setState('idle')}>
              Try again
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <label className="block font-medium mb-3" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="field mb-6"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <Button type="submit" disabled={!ready || state === 'sending'}>
              {state === 'sending' ? 'Sending…' : 'Send magic link  ↗'}
            </Button>
          </form>
        )}
      </Card>
    </>
  );
}
