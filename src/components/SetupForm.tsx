'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button, Card, Eyebrow, Hero, Lede } from '@/components/ui';

export function SetupForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [bornLabel, setBornLabel] = useState('');
  const [rememberedLabel, setRememberedLabel] = useState('');
  const [about, setAbout] = useState('');

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const response = await fetch('/api/tributes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName,
          bornLabel: bornLabel ? `Born  ·  ${bornLabel}` : '',
          rememberedLabel: rememberedLabel ? `Remembered  ·  ${rememberedLabel}` : '',
          about,
          ownerInitial: displayName.trim().slice(0, 1) || 'Y',
        }),
      });
      if (!response.ok) {
        let code: string | undefined;
        try {
          const payload = (await response.json()) as { error?: string };
          code = payload.error;
        } catch {
          code = undefined;
        }
        setError(
          code === 'persistence_unavailable'
            ? 'Saving is temporarily unavailable on this host. Please try again later.'
            : code === 'auth_required'
              ? 'Sign in before creating a memorial. Your details were not saved.'
              : 'We could not save those details. Please try again.',
        );
        return;
      }
      router.push('/workspace');
      router.refresh();
    });
  }

  return (
    <>
      <Eyebrow>STEP 01 OF 03  /  START WITH WHO THEY WERE</Eyebrow>
      <Hero>Every story begins with a person.</Hero>
      <Lede>A few details help us make a film that feels truly theirs. You can change these later.</Lede>

      <form onSubmit={onSubmit} className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
        <Card className="!p-7">
          <label className="block font-medium mb-3" htmlFor="displayName">
            Their name
          </label>
          <input
            id="displayName"
            className="field mb-6"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Their full name"
            required
            maxLength={160}
          />
          <label className="block font-medium mb-3">Important dates</label>
          <div className="grid gap-3 sm:grid-cols-2 mb-6">
            <input
              className="field"
              value={bornLabel}
              onChange={(e) => setBornLabel(e.target.value)}
              placeholder="Born  ·  year"
              maxLength={40}
              aria-label="Born year"
            />
            <input
              className="field"
              value={rememberedLabel}
              onChange={(e) => setRememberedLabel(e.target.value)}
              placeholder="Remembered  ·  year"
              maxLength={40}
              aria-label="Remembered year"
            />
          </div>
          <label className="block font-medium mb-3" htmlFor="about">
            A few words about them  (optional)
          </label>
          <textarea
            id="about"
            className="field textarea mb-4"
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            placeholder="A loving parent, a wonderful friend…"
            maxLength={500}
          />
          <p className="text-[13px] text-[color:var(--muted)] m-0">You can add more as memories arrive.</p>
          {error ? (
            <p className="text-[14px] text-red-700 mt-4 mb-0" role="alert">
              {error}
            </p>
          ) : null}
        </Card>
        <Card soft className="!p-4">
          <div className="relative h-[302px] rounded-[9px] overflow-hidden mb-5">
            <Image src="/fixtures/setup-eleanor.png" alt="" fill className="object-cover" sizes="315px" />
          </div>
          <h3 className="serif text-[33px] m-0 mb-2">One beautiful life.</h3>
          <p className="text-[color:var(--muted)] m-0">We’ll help tell their story.</p>
        </Card>

        <div className="lg:col-span-2 mt-3 flex flex-wrap items-center justify-between gap-4">
          <p className="text-[13px] text-[color:var(--muted)] m-0">Your details stay private.</p>
          <Button type="submit" className={pending ? 'opacity-70' : ''} disabled={pending}>
            {pending ? 'Saving…' : 'Continue  ↗'}
          </Button>
        </div>
      </form>
    </>
  );
}
