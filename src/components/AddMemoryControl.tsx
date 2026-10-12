'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui';
import {
  authorizeLocalUpload,
  completeLocalUpload,
  uploadFileLocalTus,
  uploadIdFromUrl,
} from '@/lib/local-tus-upload';

const FIXTURE_ROTATION = [
  '/fixtures/memory-a.png',
  '/fixtures/memory-b.png',
  '/fixtures/memory-c.png',
  '/fixtures/memory-d.png',
  '/fixtures/memory-e.png',
  '/fixtures/memory-f.png',
] as const;

export function AddMemoryControl({ nextIndex }: { nextIndex: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  function addSample() {
    setError(null);
    setInfo(null);
    setProgress(null);
    startTransition(async () => {
      const imagePath = FIXTURE_ROTATION[nextIndex % FIXTURE_ROTATION.length];
      const response = await fetch('/api/tributes/active/memories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: `Memory ${nextIndex + 1}`,
          year: String(new Date().getFullYear()),
          imagePath,
          filename: `memory-${nextIndex + 1}.jpg`,
        }),
      });
      if (!response.ok) {
        setError(
          response.status === 404
            ? 'Open or create a tribute first.'
            : 'We could not add that memory. Please try again.',
        );
        return;
      }
      setInfo('Sample queued. Preparing in the background…');
      router.refresh();
    });
  }

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    setError(null);
    setInfo(null);
    setProgress(null);
    startTransition(async () => {
      try {
        const auth = await authorizeLocalUpload({
          title: file.name.replace(/\.[^.]+$/, '').slice(0, 160) || 'New memory',
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          byteSize: file.size,
          year: String(new Date().getFullYear()),
        });
        if (auth.mode === 'rejected_heic') {
          setInfo('HEIC files need conversion on your device — we cannot prepare them automatically.');
          router.refresh();
          return;
        }
        if (!auth.uploadUrl) {
          setError('Upload could not start.');
          return;
        }
        setProgress('Uploading… 0%');
        await uploadFileLocalTus({
          file,
          uploadUrl: auth.uploadUrl,
          chunkHintBytes: auth.chunkHintBytes,
          onProgress: (sent, total) => {
            const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
            setProgress(`Uploading… ${pct}%`);
          },
        });
        await completeLocalUpload({
          uploadId: uploadIdFromUrl(auth.uploadUrl),
          assetId: auth.assetId,
        });
        setProgress(null);
        setInfo(
          auth.blocker
            ? 'Bytes saved locally (resumable TUS). Supabase Storage TUS needs Docker/credentials.'
            : 'Upload complete. Preparing memory…',
        );
        router.refresh();
      } catch {
        setProgress(null);
        setError('Upload failed. You can retry — partial local TUS offsets are kept when possible.');
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/heic,image/heif,video/mp4,.heic,.heif"
        className="sr-only"
        onChange={onFileChange}
      />
      <div className="flex flex-wrap gap-2 justify-end">
        <Button
          variant="secondary"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          className={pending ? 'opacity-70' : ''}
        >
          Choose files  ↗
        </Button>
        <Button onClick={addSample} disabled={pending} className={pending ? 'opacity-70' : ''}>
          {pending ? 'Working…' : 'Add a sample  ↗'}
        </Button>
      </div>
      {progress ? (
        <p className="text-[12px] text-[color:var(--muted)] m-0" role="status">
          {progress}
        </p>
      ) : null}
      {info ? (
        <p className="text-[12px] text-[color:var(--muted)] m-0" role="status">
          {info}
        </p>
      ) : null}
      {error ? (
        <p className="text-[12px] text-red-700 m-0" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
