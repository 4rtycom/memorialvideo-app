'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { LaunchLanguage } from '@memorialvideo/contracts';
import { Button } from '@/components/ui';
import { creatorT } from '@/lib/creator-ui-messages';
import { prepareUploadFile, isHeicFile } from '@/lib/prepare-upload-file';
import {
  authorizeLocalUpload,
  uploadAuthorizedFile,
} from '@/lib/local-tus-upload';

const FIXTURE_ROTATION = [
  '/fixtures/memory-a.png',
  '/fixtures/memory-b.png',
  '/fixtures/memory-c.png',
  '/fixtures/memory-d.png',
  '/fixtures/memory-e.png',
  '/fixtures/memory-f.png',
] as const;

type QueueItem = {
  id: string;
  file: File;
  status: 'queued' | 'uploading' | 'done' | 'failed';
  pct: number;
  /** Failure copy for this file (HEIC-specific or generic). */
  error?: string;
};

function isAudioFile(file: File): boolean {
  return file.type.startsWith('audio/') || /\.(mp3|wav|m4a)$/i.test(file.name);
}

let nextItemId = 0;

export function AddMemoryControl({
  nextIndex,
  locale,
  showSample = false,
}: {
  nextIndex: number;
  locale: LaunchLanguage;
  /** Demo photo button — local development only. */
  showSample?: boolean;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFilesRef = useRef<(files: File[]) => void>(() => undefined);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [rights, setRights] = useState(false);
  /** Audio files waiting for the rights confirmation. */
  const [blockedAudio, setBlockedAudio] = useState<File[]>([]);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [heicNote, setHeicNote] = useState<string | null>(null);

  function patchItem(id: string, patch: Partial<QueueItem>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addSample() {
    setError(null);
    setInfo(null);
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

  /** Uploads one file; throws on failure. */
  async function uploadOne(item: QueueItem, audio: boolean): Promise<void> {
    const file = item.file;
    if (isHeicFile(file)) {
      setHeicNote(creatorT(locale, 'creator.memories.preparingHeic'));
    }
    const prepared = await prepareUploadFile(file);
    setHeicNote(null);
    const uploadFile = prepared.file;
    const auth = await authorizeLocalUpload({
      title: file.name.replace(/\.[^.]+$/, '').slice(0, 160) || 'New memory',
      filename: uploadFile.name,
      contentType: uploadFile.type || 'application/octet-stream',
      byteSize: uploadFile.size,
      year: String(new Date().getFullYear()),
      musicRightsConfirmed: audio ? true : undefined,
    });
    await uploadAuthorizedFile({
      auth,
      file: uploadFile,
      onProgress: (sent, total) => {
        patchItem(item.id, { pct: total > 0 ? Math.round((sent / total) * 100) : 0 });
      },
    });
  }

  /** Sequential queue: one failed file never blocks the rest. */
  function runQueue(queue: QueueItem[]) {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      let added = 0;
      for (const item of queue) {
        patchItem(item.id, { status: 'uploading', pct: 0, error: undefined });
        try {
          await uploadOne(item, isAudioFile(item.file));
          patchItem(item.id, { status: 'done', pct: 100 });
          added += 1;
        } catch {
          setHeicNote(null);
          patchItem(item.id, {
            status: 'failed',
            error: isHeicFile(item.file)
              ? creatorT(locale, 'creator.memories.heic')
              : creatorT(locale, 'creator.memories.uploadFailed'),
          });
        }
      }
      if (added > 0) {
        setInfo(
          added === 1
            ? creatorT(locale, 'creator.memories.uploadDone')
            : creatorT(locale, 'creator.memories.filesDone').replace('{count}', String(added)),
        );
        router.refresh();
      }
    });
  }

  function handleFiles(files: File[]) {
    if (files.length === 0) {
      return;
    }
    const ready: File[] = [];
    const blocked: File[] = [];
    for (const file of files) {
      if (isAudioFile(file) && !rights) {
        blocked.push(file);
      } else {
        ready.push(file);
      }
    }
    if (blocked.length > 0) {
      setBlockedAudio((current) => [...current, ...blocked]);
      setError(creatorT(locale, 'creator.memories.rightsRequired'));
    }
    if (ready.length === 0) {
      return;
    }
    const queue: QueueItem[] = ready.map((file) => ({
      id: `upload-${(nextItemId += 1)}`,
      file,
      status: 'queued',
      pct: 0,
    }));
    setItems((current) => [...current.filter((item) => item.status !== 'done'), ...queue]);
    runQueue(queue);
  }
  handleFilesRef.current = handleFiles;

  function onRightsChange(checked: boolean) {
    setRights(checked);
    if (checked && blockedAudio.length > 0) {
      const files = blockedAudio;
      setBlockedAudio([]);
      setError(null);
      const queue: QueueItem[] = files.map((file) => ({
        id: `upload-${(nextItemId += 1)}`,
        file,
        status: 'queued',
        pct: 0,
      }));
      setItems((current) => [...current, ...queue]);
      runQueue(queue);
    }
  }

  function retry(item: QueueItem) {
    runQueue([{ ...item, status: 'queued', pct: 0, error: undefined }]);
  }

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    handleFiles(files);
  }

  // The visible drop target is the surrounding `.upload-zone`; wire drag-and-drop onto it.
  useEffect(() => {
    const zone = rootRef.current?.closest<HTMLElement>('.upload-zone');
    if (!zone) {
      return;
    }
    const activeClass = 'upload-zone-active';
    function onDragOver(event: DragEvent) {
      if (!event.dataTransfer?.types.includes('Files')) {
        return;
      }
      event.preventDefault();
      zone?.classList.add(activeClass);
    }
    function onDragLeave(event: DragEvent) {
      if (event.relatedTarget instanceof Node && zone?.contains(event.relatedTarget)) {
        return;
      }
      zone?.classList.remove(activeClass);
    }
    function onDrop(event: DragEvent) {
      event.preventDefault();
      zone?.classList.remove(activeClass);
      handleFilesRef.current(Array.from(event.dataTransfer?.files ?? []));
    }
    zone.addEventListener('dragover', onDragOver);
    zone.addEventListener('dragleave', onDragLeave);
    zone.addEventListener('drop', onDrop);
    return () => {
      zone.removeEventListener('dragover', onDragOver);
      zone.removeEventListener('dragleave', onDragLeave);
      zone.removeEventListener('drop', onDrop);
    };
  }, []);

  const uploadingItems = items.filter((item) => item.status === 'uploading');
  const total = items.length;
  const queuePosition = items.findIndex((item) => item.status === 'uploading') + 1;

  return (
    <div ref={rootRef} className="flex flex-col items-end gap-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,video/mp4,video/quicktime,audio/mpeg,audio/wav,audio/mp4,.mp3,.wav,.m4a,.mov"
        className="sr-only"
        onChange={onFileChange}
      />
      <div className="flex flex-wrap gap-2 justify-end">
        <Button
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          className={pending ? 'opacity-70' : ''}
        >
          {creatorT(locale, 'creator.memories.choose')}
        </Button>
        {showSample ? (
          <Button
            variant="secondary"
            onClick={addSample}
            disabled={pending}
            className={pending ? 'opacity-70' : ''}
          >
            {pending ? creatorT(locale, 'creator.memories.working') : creatorT(locale, 'creator.memories.sample')}
          </Button>
        ) : null}
      </div>
      {blockedAudio.length > 0 || rights ? (
        <label className="flex items-start gap-2 text-[14px] text-[color:var(--muted)] max-w-sm text-left">
          <input
            type="checkbox"
            checked={rights}
            onChange={(event) => onRightsChange(event.target.checked)}
          />
          <span>{creatorT(locale, 'creator.memories.rights')}</span>
        </label>
      ) : null}
      {heicNote ? (
        <p className="text-[14px] text-[color:var(--muted)] m-0" role="status">
          {heicNote}
        </p>
      ) : null}
      {items.length > 0 ? (
        <ul className="list-none p-0 m-0 grid gap-2 w-full max-w-sm text-left" aria-label={creatorT(locale, 'creator.memories.uploading')}>
          {items.map((item) => (
            <li key={item.id} className="text-[14px]">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate" title={item.file.name}>
                  {item.status === 'uploading'
                    ? creatorT(locale, 'creator.memories.fileProgress')
                        .replace('{current}', String(queuePosition))
                        .replace('{total}', String(Math.max(total, queuePosition)))
                        .replace('{name}', item.file.name)
                    : item.status === 'done'
                      ? creatorT(locale, 'creator.memories.fileDone').replace('{name}', item.file.name)
                      : item.status === 'failed'
                        ? creatorT(locale, 'creator.memories.fileFailed').replace('{name}', item.file.name)
                        : item.file.name}
                </span>
                {item.status === 'failed' ? (
                  <Button variant="ghost" disabled={pending} onClick={() => retry(item)}>
                    {creatorT(locale, 'creator.memories.retry')}
                  </Button>
                ) : null}
              </div>
              {item.status === 'uploading' ? (
                <progress
                  className="w-full h-2"
                  value={item.pct}
                  max={100}
                  aria-label={`${creatorT(locale, 'creator.memories.uploading')} ${item.file.name}`}
                />
              ) : null}
              {item.status === 'failed' && item.error ? (
                <p className="text-[14px] text-red-700 m-0 mt-1" role="alert">
                  {item.error}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {uploadingItems.length === 0 && info ? (
        <p className="text-[14px] text-[color:var(--muted)] m-0" role="status">
          {info}
        </p>
      ) : null}
      {error ? (
        <p className="text-[14px] text-red-700 m-0" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
