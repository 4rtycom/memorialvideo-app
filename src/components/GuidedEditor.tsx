'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import type { TimelineContract } from '@memorialvideo/contracts';
import type { AutosaveUiState } from '@memorialvideo/domain';
import { Button, Card } from '@/components/ui';
import { autosaveLabel, patchTimeline } from '@/lib/timeline-patch';

type ImageScene = Extract<TimelineContract['scenes'][number], { type: 'image' }>;

export function GuidedEditor({
  timeline,
  timelineVersion,
  updatedAt,
  canUndo = false,
}: {
  timeline: TimelineContract;
  timelineVersion: number;
  updatedAt: string;
  canUndo?: boolean;
}) {
  const router = useRouter();
  const imageScenes = useMemo(
    () => timeline.scenes.filter((s): s is ImageScene => s.type === 'image'),
    [timeline],
  );
  const [selectedId, setSelectedId] = useState(imageScenes[0]?.id ?? '');
  const [caption, setCaption] = useState(imageScenes[0]?.caption ?? '');
  const [version, setVersion] = useState(timelineVersion);
  const [clientUpdatedAt, setClientUpdatedAt] = useState(updatedAt);
  const [undoAvailable, setUndoAvailable] = useState(canUndo);
  const [pending, startTransition] = useTransition();
  const [saveUi, setSaveUi] = useState<AutosaveUiState>('local');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = imageScenes.find((s) => s.id === selectedId) ?? imageScenes[0];

  function select(scene: ImageScene) {
    setSelectedId(scene.id);
    setCaption(scene.caption ?? '');
    setStatus(null);
    setError(null);
  }

  function runPatch(body: Record<string, unknown>, okMessage: string) {
    setError(null);
    setSaveUi('saving');
    startTransition(async () => {
      const result = await patchTimeline({
        ...body,
        expectedVersion: version,
        clientUpdatedAt,
      });
      setSaveUi(result.ui);
      if (!result.ok) {
        if (result.ui === 'conflict') {
          setError('Someone saved a newer timeline. Reload to continue — nothing was overwritten.');
        } else {
          setError('Could not save that change. Your previous timeline is still safe.');
        }
        return;
      }
      setVersion(result.timelineVersion);
      setClientUpdatedAt(result.updatedAt);
      setUndoAvailable(Boolean(result.canUndo));
      setStatus(okMessage);
      router.refresh();
    });
  }

  if (!selected) {
    return (
      <Card soft className="!p-7">
        <p className="m-0 text-[color:var(--muted)]">
          Arrange the first film to edit story moments on the shared TimelineContract.
        </p>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[1.8fr_1fr] mb-4">
        <div className="bg-[color:var(--cinema)] rounded-[14px] p-3">
          <div className="relative h-[314px] rounded-[10px] overflow-hidden">
            <Image src={selected.asset.src} alt="" fill className="object-cover" sizes="673px" />
          </div>
          <div className="bg-[color:var(--primary)] text-white rounded-[8px] px-5 py-3 mt-2">
            <div className="serif text-[33px]">{selected.caption || 'A life beautifully lived'}</div>
          </div>
          <p className="text-white/90 px-2 py-3 m-0">
            {Math.round((selected.durationFrames / timeline.fps) * 10) / 10}s · {selected.transitionIn}
          </p>
        </div>
        <Card className="!p-6">
          <h3 className="serif text-[31px] m-0 mb-3">This moment</h3>
          <div className="text-[11px] font-bold text-[color:var(--accent)] mb-2">GUIDED  /  TIMELINECONTRACT</div>
          <p className="text-[12px] text-[color:var(--muted)] mb-4" role="status" aria-live="polite">
            v{version} · {autosaveLabel(saveUi)}
          </p>
          <p className="font-medium mb-2">Opening words</p>
          <textarea
            className="field textarea mb-5"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={180}
          />
          <Button
            variant="secondary"
            className="btn-block mb-3"
            disabled={pending || saveUi === 'conflict'}
            onClick={() =>
              runPatch({ op: 'set_caption', sceneId: selected.id, caption }, 'Caption saved on the shared timeline.')
            }
          >
            Save words  ↗
          </Button>
          <Button
            variant="secondary"
            className="btn-block mb-3"
            disabled={pending || saveUi === 'conflict'}
            onClick={() =>
              runPatch(
                {
                  op: 'set_duration',
                  sceneId: selected.id,
                  durationFrames: Math.min(240, selected.durationFrames + 30),
                },
                'Moment lengthened.',
              )
            }
          >
            Hold a little longer
          </Button>
          <Button
            variant="secondary"
            className="btn-block mb-3"
            disabled={pending || saveUi === 'conflict'}
            onClick={() =>
              runPatch(
                {
                  op: 'set_duration',
                  sceneId: selected.id,
                  durationFrames: Math.max(60, selected.durationFrames - 30),
                },
                'Moment shortened.',
              )
            }
          >
            A little shorter
          </Button>
          <Button
            variant="secondary"
            className="btn-block mb-3"
            disabled={pending || saveUi === 'conflict'}
            onClick={() =>
              runPatch(
                { op: 'set_transition', sceneId: selected.id, transitionIn: 'dissolve' },
                'Gentle dissolve applied.',
              )
            }
          >
            Gentle dissolve
          </Button>
          <Button
            variant="ghost"
            className="btn-block"
            disabled={pending || !undoAvailable}
            onClick={() => runPatch({ op: 'undo' }, 'Last Guided/Studio change undone.')}
          >
            Undo last change
          </Button>
          {saveUi === 'conflict' ? (
            <Button className="btn-block mt-3" onClick={() => router.refresh()}>
              Reload timeline  ↗
            </Button>
          ) : null}
          {status ? (
            <p className="text-[13px] mt-4 mb-0" role="status">
              {status}
            </p>
          ) : null}
          {error ? (
            <p className="text-[13px] text-red-700 mt-4 mb-0" role="alert">
              {error}
            </p>
          ) : null}
        </Card>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] font-bold text-[color:var(--accent)]">STORY MOMENTS  ·  SHARED TIMELINE</div>
        <div className="text-[13px] text-[color:var(--muted)]">Saved on TimelineContract</div>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {imageScenes.map((m, index) => (
          <button key={m.id} type="button" className="text-left" onClick={() => select(m)}>
            <Card className={`!p-2 ${m.id === selected.id ? '!bg-[color:var(--cinema-soft)]' : ''}`}>
              <div className="grid grid-cols-[93px_1fr] gap-3 items-center">
                <div className="relative h-[84px] rounded-[10px] overflow-hidden">
                  <Image src={m.asset.src} alt="" fill className="object-cover" sizes="93px" />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-[color:var(--accent)]">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <div className="serif text-[18px] leading-tight">{m.caption || 'Moment'}</div>
                </div>
              </div>
            </Card>
          </button>
        ))}
      </div>
    </>
  );
}
