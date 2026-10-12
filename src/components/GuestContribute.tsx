'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Button, ErrorState } from '@/components/ui';
import { classifyInviteRedeemFailure, inviteRedeemMessage } from '@/lib/async-ui';
import {
  completeLocalUpload,
  uploadFileLocalTus,
  uploadIdFromUrl,
  type AuthorizeResponse,
} from '@/lib/local-tus-upload';

type GuestInfo = {
  displayName: string;
  years: string;
};

export function GuestContribute() {
  const [guest, setGuest] = useState<GuestInfo | null>(null);
  const [phase, setPhase] = useState<'redeeming' | 'ready' | 'uploading' | 'thanks' | 'error'>(
    'redeeming',
  );
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef('');
  const started = useRef(false);

  function redeem() {
    const token = tokenRef.current;
    if (!token) {
      setPhase('error');
      setError(inviteRedeemMessage('incomplete'));
      setRetryable(false);
      return;
    }
    setPhase('redeeming');
    setError(null);
    setRetryable(false);
    startTransition(async () => {
      try {
        const response = await fetch('/api/invites/redeem', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          const code = body.error;
          setPhase('error');
          setError(inviteRedeemMessage(code));
          setRetryable(classifyInviteRedeemFailure(code) === 'retryable');
          return;
        }
        const body = (await response.json()) as GuestInfo;
        setGuest(body);
        setPhase('ready');
        // Clear token from address bar without reload.
        window.history.replaceState(null, '', '/guest');
        tokenRef.current = '';
      } catch {
        setPhase('error');
        setError(inviteRedeemMessage(undefined));
        setRetryable(true);
      }
    });
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
    const token = params.get('t') ?? '';
    if (!token || token.length < 16) {
      setPhase('error');
      setError(inviteRedeemMessage('incomplete'));
      setRetryable(false);
      return;
    }
    tokenRef.current = token;
    redeem();
  }, []);

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    setProgress(null);
    setPhase('uploading');
    startTransition(async () => {
      try {
        const response = await fetch('/api/uploads/contributor/authorize', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: file.name.replace(/\.[^.]+$/, '').slice(0, 160) || 'Shared memory',
            filename: file.name,
            contentType: file.type || 'application/octet-stream',
            byteSize: file.size,
            year: String(new Date().getFullYear()),
            contributorName: name.trim() || undefined,
            contributorNote: note.trim() || undefined,
          }),
        });
        if (!response.ok) {
          throw new Error(`authorize_${response.status}`);
        }
        const auth = (await response.json()) as AuthorizeResponse;
        if (auth.mode === 'rejected_heic') {
          setPhase('ready');
          setError('HEIC files need conversion on your device before uploading.');
          return;
        }
        if (!auth.uploadUrl || !auth.assetId) {
          throw new Error('missing_upload');
        }
        await uploadFileLocalTus({
          file,
          uploadUrl: auth.uploadUrl,
          chunkHintBytes: auth.chunkHintBytes,
          onProgress: (sent, total) => {
            setProgress(`${Math.round((sent / total) * 100)}%`);
          },
        });
        await completeLocalUpload({
          uploadId: uploadIdFromUrl(auth.uploadUrl),
          assetId: auth.assetId,
        });
        setPhase('thanks');
      } catch {
        setPhase('ready');
        setError('Upload did not finish. Please try again.');
      }
    });
  }

  if (phase === 'redeeming') {
    return (
      <main className="px-6 pt-16 text-center">
        <p className="eyebrow">OPENING INVITATION</p>
        <h1 className="serif text-[40px] leading-[1.05] m-0">One moment…</h1>
      </main>
    );
  }

  if (phase === 'error') {
    return (
      <main className="px-6 pt-16 text-center">
        <p className="eyebrow">INVITATION</p>
        <h1 className="serif text-[40px] leading-[1.05] m-0 mb-4">Unable to open</h1>
        <div className="max-w-md mx-auto mb-8 text-left">
          <ErrorState
            title={error ?? inviteRedeemMessage(undefined)}
            body="Your contribution was not started."
            action={
              retryable ? (
                <Button onClick={redeem}>Try again</Button>
              ) : (
                <Button href="/" variant="secondary">
                  Back
                </Button>
              )
            }
          />
        </div>
        {retryable ? (
          <Link href="/" className="btn btn-secondary btn-block">
            Back
          </Link>
        ) : null}
      </main>
    );
  }

  if (phase === 'thanks') {
    return (
      <main className="px-6 pt-16 text-center">
        <p className="eyebrow">THANK YOU</p>
        <h1 className="serif text-[46px] leading-[1.05] m-0 mb-5">Your memory has been received.</h1>
        <p className="text-[color:var(--muted)] mb-10">
          The family will review it privately before anything is added to the film.
        </p>
        <div className="card soft !p-6 mb-8 text-left">
          <div className="serif text-[28px] mb-2">Gently held.</div>
          <p className="text-[color:var(--muted)] m-0">
            Nothing is published. Nothing is shared without the owner’s approval.
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-block" onClick={() => setPhase('ready')}>
          Add another
        </button>
      </main>
    );
  }

  return (
    <main className="px-6 pt-8">
      <div className="relative h-[220px] rounded-[10px] overflow-hidden mb-6">
        <Image src="/fixtures/guest-portrait.png" alt="" fill className="object-cover" sizes="342px" priority />
        <div className="absolute inset-x-0 bottom-0 bg-[color:var(--primary)] text-white px-5 py-4">
          <div className="serif text-[34px] leading-none">{guest?.displayName ?? 'A loved one'}</div>
          {guest?.years ? (
            <div className="text-[13px] text-[color:var(--cinema-soft)] mt-1">{guest.years}</div>
          ) : null}
        </div>
      </div>
      <p className="eyebrow">A LOVING INVITATION</p>
      <h1 className="serif text-[42px] leading-[1.03] m-0 mb-4">
        Share a memory
        {guest?.displayName ? (
          <>
            <br />
            of {guest.displayName.split(' ')[0]}.
          </>
        ) : (
          '.'
        )}
      </h1>
      <p className="text-[15px] text-[color:var(--muted)] mb-6">
        No account needed. Your upload stays private until the family reviews it.
      </p>

      <label className="block font-medium mb-2">Your first name (optional)</label>
      <input
        className="field mb-4"
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        maxLength={40}
        autoComplete="given-name"
      />
      <label className="block font-medium mb-2">A short note (optional)</label>
      <textarea
        className="field textarea mb-6"
        value={note}
        onChange={(event) => setNote(event.currentTarget.value)}
        maxLength={280}
      />

      <div className="card mb-4 !p-6">
        <div className="text-[35px] text-[color:var(--accent)] mb-2">＋</div>
        <div className="font-medium text-[20px] mb-1">Choose photos & videos</div>
        <p className="text-[13px] text-[color:var(--muted)] m-0">JPG, PNG, MP4 · private upload</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4"
          className="sr-only"
          onChange={onFileChange}
        />
        <button
          type="button"
          className="btn btn-primary btn-block mt-5"
          disabled={pending || phase === 'uploading'}
          onClick={() => inputRef.current?.click()}
        >
          {phase === 'uploading' ? `Uploading${progress ? ` ${progress}` : '…'}` : 'Add photos or videos  ↗'}
        </button>
      </div>
      {error ? (
        <p className="text-[14px] text-[color:var(--accent)]" role="alert">
          {error}
        </p>
      ) : null}
      <p className="text-center text-[12px] text-[color:var(--muted)] mt-4">
        No account needed · Private invitation
      </p>
    </main>
  );
}
