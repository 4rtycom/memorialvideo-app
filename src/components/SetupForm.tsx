'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { LaunchLanguage } from '@memorialvideo/contracts';
import { Button, Card, Eyebrow, Hero, Lede } from '@/components/ui';
import { creatorT } from '@/lib/creator-ui-messages';

export function SetupForm({ locale = 'en' }: { locale?: LaunchLanguage }) {
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
          bornLabel: bornLabel
            ? creatorT(locale, 'creator.setup.bornPrefix').replace('{year}', bornLabel)
            : '',
          rememberedLabel: rememberedLabel
            ? creatorT(locale, 'creator.setup.rememberedPrefix').replace('{year}', rememberedLabel)
            : '',
          about,
          ownerInitial: displayName.trim().slice(0, 1) || 'Y',
          locale,
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
            ? creatorT(locale, 'creator.setup.errorPersistence')
            : code === 'auth_required'
              ? creatorT(locale, 'creator.setup.errorAuth')
              : creatorT(locale, 'creator.setup.errorGeneric'),
        );
        return;
      }
      router.push('/workspace');
      router.refresh();
    });
  }

  return (
    <>
      <Eyebrow>{creatorT(locale, 'creator.setup.eyebrow')}</Eyebrow>
      <Hero>{creatorT(locale, 'creator.setup.hero')}</Hero>
      <Lede>{creatorT(locale, 'creator.setup.lede')}</Lede>

      <form onSubmit={onSubmit} className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
        <Card className="!p-7">
          <label className="block font-medium mb-3" htmlFor="displayName">
            {creatorT(locale, 'creator.setup.name')}
          </label>
          <input
            id="displayName"
            className="field mb-6"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={creatorT(locale, 'creator.setup.namePlaceholder')}
            required
            maxLength={160}
          />
          <label className="block font-medium mb-3">{creatorT(locale, 'creator.setup.dates')}</label>
          <div className="grid gap-3 sm:grid-cols-2 mb-6">
            <input
              className="field"
              value={bornLabel}
              onChange={(e) => setBornLabel(e.target.value)}
              placeholder={creatorT(locale, 'creator.setup.bornPlaceholder')}
              maxLength={40}
              aria-label={creatorT(locale, 'creator.setup.bornAria')}
            />
            <input
              className="field"
              value={rememberedLabel}
              onChange={(e) => setRememberedLabel(e.target.value)}
              placeholder={creatorT(locale, 'creator.setup.rememberedPlaceholder')}
              maxLength={40}
              aria-label={creatorT(locale, 'creator.setup.rememberedAria')}
            />
          </div>
          <label className="block font-medium mb-3" htmlFor="about">
            {creatorT(locale, 'creator.setup.about')}
          </label>
          <textarea
            id="about"
            className="field textarea mb-4"
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            placeholder={creatorT(locale, 'creator.setup.aboutPlaceholder')}
            maxLength={500}
          />
          <p className="text-[13px] text-[color:var(--muted)] m-0">
            {creatorT(locale, 'creator.setup.aboutHint')}
          </p>
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
          <h3 className="serif text-[33px] m-0 mb-2">{creatorT(locale, 'creator.setup.asideTitle')}</h3>
          <p className="text-[color:var(--muted)] m-0">{creatorT(locale, 'creator.setup.asideBody')}</p>
        </Card>

        <div className="lg:col-span-2 mt-3 flex flex-wrap items-center justify-between gap-4">
          <p className="text-[13px] text-[color:var(--muted)] m-0">
            {creatorT(locale, 'creator.setup.privacy')}
          </p>
          <Button type="submit" className={pending ? 'opacity-70' : ''} disabled={pending}>
            {pending
              ? creatorT(locale, 'creator.common.saving')
              : creatorT(locale, 'creator.common.continue')}
          </Button>
        </div>
      </form>
    </>
  );
}
