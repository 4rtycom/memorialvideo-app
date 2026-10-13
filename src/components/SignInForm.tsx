'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { LaunchLanguage } from '@memorialvideo/contracts';
import { Button, Card, Eyebrow, Hero, Lede } from '@/components/ui';
import { creatorT } from '@/lib/creator-ui-messages';

type AuthMode = 'sign-in' | 'register';
type FormState = 'idle' | 'submitting' | 'failed' | 'magic-sent' | 'magic-failed';

export function SignInForm({
  configured,
  passwordReady,
  locale,
}: {
  configured: boolean;
  passwordReady: boolean;
  locale: LaunchLanguage;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [state, setState] = useState<FormState>('idle');
  const [detail, setDetail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  async function onPassword(event: FormEvent) {
    event.preventDefault();
    setDetail(null);
    if (password.length < 10) {
      setDetail(creatorT(locale, 'creator.auth.short'));
      setState('failed');
      return;
    }
    setState('submitting');
    try {
      const response = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, mode }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        if (payload?.error === 'exists') {
          setDetail(creatorT(locale, 'creator.auth.exists'));
        } else if (payload?.error === 'auth_not_configured') {
          setDetail(creatorT(locale, 'creator.auth.notConfigured'));
        } else {
          setDetail(creatorT(locale, 'creator.auth.failed'));
        }
        setState('failed');
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setDetail(creatorT(locale, 'creator.auth.failed'));
      setState('failed');
    }
  }

  async function onMagic(event: FormEvent) {
    event.preventDefault();
    setState('submitting');
    try {
      const response = await fetch('/api/auth/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setState(response.ok ? 'magic-sent' : 'magic-failed');
    } catch {
      setState('magic-failed');
    }
  }

  return (
    <>
      <Eyebrow>{creatorT(locale, 'creator.auth.eyebrow')}</Eyebrow>
      <Hero>{creatorT(locale, 'creator.auth.hero')}</Hero>
      <Lede>{creatorT(locale, 'creator.auth.lede')}</Lede>

      <Card className="!p-7 max-w-xl">
        {!passwordReady ? (
          <p className="text-[color:var(--muted)] m-0" role="status">
            {creatorT(locale, 'creator.auth.notConfigured')}
          </p>
        ) : (
          <form onSubmit={onPassword}>
            <label className="block font-medium mb-3" htmlFor="email">
              {creatorT(locale, 'creator.auth.email')}
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
            <label className="block font-medium mb-3" htmlFor="password">
              {creatorT(locale, 'creator.auth.password')}
            </label>
            <input
              id="password"
              className="field mb-6"
              type="password"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {state === 'failed' && detail ? (
              <p className="m-0 mb-4" role="alert">
                {detail}
              </p>
            ) : null}
            <Button type="submit" disabled={!ready || state === 'submitting'}>
              {state === 'submitting'
                ? creatorT(locale, 'creator.auth.submitting')
                : mode === 'register'
                  ? creatorT(locale, 'creator.auth.create')
                  : creatorT(locale, 'creator.auth.signIn')}
            </Button>
            <p className="mt-4 mb-0">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setMode(mode === 'register' ? 'sign-in' : 'register');
                  setState('idle');
                  setDetail(null);
                }}
              >
                {mode === 'register'
                  ? creatorT(locale, 'creator.auth.switchSignIn')
                  : creatorT(locale, 'creator.auth.switchCreate')}
              </button>
            </p>
          </form>
        )}
      </Card>

      <Card className="!p-7 max-w-xl mt-6">
        <h2 className="serif text-[28px] m-0 mb-3">{creatorT(locale, 'creator.auth.magic')}</h2>
        {!configured ? (
          <p className="text-[color:var(--muted)] m-0" role="status">
            {creatorT(locale, 'creator.auth.magicUnconfigured')}
          </p>
        ) : state === 'magic-sent' ? (
          <p className="m-0" role="status">
            {creatorT(locale, 'creator.auth.magicSent')}
          </p>
        ) : state === 'magic-failed' ? (
          <div>
            <p className="m-0 mb-4" role="alert">
              {creatorT(locale, 'creator.auth.magicFailed')}
            </p>
            <Button type="button" onClick={() => setState('idle')}>
              {creatorT(locale, 'creator.auth.signIn')}
            </Button>
          </div>
        ) : (
          <form onSubmit={onMagic}>
            <Button type="submit" variant="secondary" disabled={!ready || state === 'submitting'}>
              {creatorT(locale, 'creator.auth.magicSend')}
            </Button>
          </form>
        )}
      </Card>
    </>
  );
}
