'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import type { LaunchLanguage } from '@memorialvideo/contracts';
import { Button } from '@/components/ui';
import { creatorT } from '@/lib/creator-ui-messages';
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

export function AddMemoryControl({
  nextIndex,
  locale,
}: {
  nextIndex: number;
  locale: LaunchLanguage;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [rights, setRights] = useState(false);
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
            ? creatorT(locale, 'creator.memories.needTribute')
            : creatorT(locale, 'creator.memories.addFailed'),
        );
        return;
      }
      setInfo(creatorT(locale, 'creator.memories.sampleQueued'));
      router.refresh();
    });
  }

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    const audio = file.type.startsWith('audio/') || /\.(mp3|wav|m4a)$/i.test(file.name);
    if (audio && !rights) {
      setError(creatorT(locale, 'creator.memories.rightsRequired'));
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
          musicRightsConfirmed: audio ? true : undefined,
        });
        if (auth.mode === 'rejected_heic') {
          setInfo(creatorT(locale, 'creator.memories.heic'));
          router.refresh();
          return;
        }
        if (!auth.uploadUrl) {
          setError(creatorT(locale, 'creator.memories.uploadStart'));
          return;
        }
        setProgress(`${creatorT(locale, 'creator.memories.uploading')} 0%`);
        await uploadFileLocalTus({
          file,
          uploadUrl: auth.uploadUrl,
          chunkHintBytes: auth.chunkHintBytes,
          onProgress: (sent, total) => {
            const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
            setProgress(`${creatorT(locale, 'creator.memories.uploading')} ${pct}%`);
          },
        });
        await completeLocalUpload({
          uploadId: uploadIdFromUrl(auth.uploadUrl),
          assetId: auth.assetId,
        });
        setProgress(null);
        setInfo(creatorT(locale, 'creator.memories.uploadDone'));
        router.refresh();
      } catch {
        setProgress(null);
        setError(creatorT(locale, 'creator.memories.uploadFailed'));
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime,audio/mpeg,audio/wav,audio/mp4,.mp3,.wav,.m4a,.mov"
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
          {creatorT(locale, 'creator.memories.choose')}  ↗
        </Button>
        <Button onClick={addSample} disabled={pending} className={pending ? 'opacity-70' : ''}>
          {pending ? creatorT(locale, 'creator.memories.working') : `${creatorT(locale, 'creator.memories.sample')}  ↗`}
        </Button>
      </div>
      <label className="flex items-start gap-2 text-[12px] text-[color:var(--muted)] max-w-sm text-left">
        <input
          type="checkbox"
          checked={rights}
          onChange={(event) => setRights(event.target.checked)}
        />
        <span>{creatorT(locale, 'creator.memories.rights')}</span>
      </label>
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
