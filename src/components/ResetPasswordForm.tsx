'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { LaunchLanguage } from '@memorialvideo/contracts';
import { Button, Card, Eyebrow, Hero, Lede } from '@/components/ui';

type Copy = {
  eyebrow: string;
  hero: string;
  lede: string;
  email: string;
  send: string;
  sent: string;
  newHero: string;
  password: string;
  save: string;
  saving: string;
  short: string;
  expired: string;
  failed: string;
  back: string;
};

const EN: Copy = {
  eyebrow: 'Password',
  hero: 'Reset your password',
  lede: 'Enter your email address. If there is an account for it, we will send a link to choose a new password.',
  email: 'Email address',
  send: 'Send the link',
  sent: 'If there is an account for that address, a link is on its way. It works once, for 30 minutes.',
  newHero: 'Choose a new password',
  password: 'New password (at least 10 characters)',
  save: 'Save and sign in',
  saving: 'Saving…',
  short: 'Use at least 10 characters.',
  expired: 'This link has expired or was already used. Ask for a new one.',
  failed: 'That did not work. Your work is safe. Please try again.',
  back: 'Back to sign in',
};

const NL: Copy = {
  eyebrow: 'Wachtwoord',
  hero: 'Wachtwoord herstellen',
  lede: 'Vul je e-mailadres in. Als er een account bij hoort, sturen we een link om een nieuw wachtwoord te kiezen.',
  email: 'E-mailadres',
  send: 'Stuur de link',
  sent: 'Als er een account bij dat adres hoort, is er een link onderweg. Hij werkt één keer, 30 minuten lang.',
  newHero: 'Kies een nieuw wachtwoord',
  password: 'Nieuw wachtwoord (minstens 10 tekens)',
  save: 'Opslaan en inloggen',
  saving: 'Opslaan…',
  short: 'Gebruik minstens 10 tekens.',
  expired: 'Deze link is verlopen of al gebruikt. Vraag een nieuwe aan.',
  failed: 'Dat is niet gelukt. Je werk is veilig. Probeer het opnieuw.',
  back: 'Terug naar inloggen',
};

export function ResetPasswordForm({ locale }: { locale: LaunchLanguage }) {
  const router = useRouter();
  const t = locale === 'nl' ? NL : EN;
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle');
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    // The token lives in the URL fragment so it never reaches server or proxy logs.
    const match = /[#&]t=([^&]+)/.exec(window.location.hash);
    setToken(match?.[1] ? decodeURIComponent(match[1]) : null);
  }, []);

  async function onRequest(event: FormEvent) {
    event.preventDefault();
    setState('busy');
    try {
      await fetch('/api/auth/reset/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch {
      /* the answer is the same either way */
    }
    setState('sent');
  }

  async function onConfirm(event: FormEvent) {
    event.preventDefault();
    if (password.length < 10) {
      setDetail(t.short);
      setState('error');
      return;
    }
    setState('busy');
    setDetail(null);
    try {
      const response = await fetch('/api/auth/reset/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (response.ok) {
        window.history.replaceState(null, '', '/reset');
        router.push('/');
        router.refresh();
        return;
      }
      setDetail(response.status === 410 || response.status === 400 ? t.expired : t.failed);
    } catch {
      setDetail(t.failed);
    }
    setState('error');
  }

  return (
    <>
      <Eyebrow>{t.eyebrow}</Eyebrow>
      <Hero>{token ? t.newHero : t.hero}</Hero>
      {!token ? <Lede>{t.lede}</Lede> : null}
      <Card className="!p-7 max-w-xl">
        {token ? (
          <form onSubmit={onConfirm}>
            <label className="block font-medium mb-3" htmlFor="new-password">
              {t.password}
            </label>
            <input
              id="new-password"
              className="field mb-6"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {state === 'error' && detail ? (
              <p className="m-0 mb-4" role="alert">
                {detail}
              </p>
            ) : null}
            <Button type="submit" disabled={state === 'busy'}>
              {state === 'busy' ? t.saving : t.save}
            </Button>
          </form>
        ) : state === 'sent' ? (
          <p className="m-0" role="status">
            {t.sent}
          </p>
        ) : (
          <form onSubmit={onRequest}>
            <label className="block font-medium mb-3" htmlFor="reset-email">
              {t.email}
            </label>
            <input
              id="reset-email"
              className="field mb-6"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <Button type="submit" disabled={state === 'busy'}>
              {t.send}
            </Button>
          </form>
        )}
        <p className="mt-4 mb-0">
          <a className="btn btn-ghost" href="/sign-in">
            {t.back}
          </a>
        </p>
      </Card>
    </>
  );
}
