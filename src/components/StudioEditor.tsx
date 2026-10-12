'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import type { TimelineContract } from '@memorialvideo/contracts';
import type { AutosaveUiState } from '@memorialvideo/domain';
import { Button, Card } from '@/components/ui';
import { autosaveLabel, patchTimeline } from '@/lib/timeline-patch';

type ImageScene = Extract<TimelineContract['scenes'][number], { type: 'image' }>;

export function StudioEditor({
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
  const [version, setVersion] = useState(timelineVersion);
  const [clientUpdatedAt, setClientUpdatedAt] = useState(updatedAt);
  const [undoAvailable, setUndoAvailable] = useState(canUndo);
  const [pending, startTransition] = useTransition();
  const [saveUi, setSaveUi] = useState<AutosaveUiState>('local');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = imageScenes.find((s) => s.id === selectedId) ?? imageScenes[0];
  const aspect =
    timeline.width === 1080 && timeline.height === 1920
      ? '9:16'
      : timeline.width === 1080 && timeline.height === 1080
        ? '1:1'
        : '16:9';

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
          setError('Studio conflict — a newer TimelineContract exists. Reload before editing.');
        } else {
          setError('Studio change could not be saved. Timeline unchanged.');
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
          Arrange the first film to unlock Studio controls on the shared TimelineContract.
        </p>
      </Card>
    );
  }

  const selectedIndex = timeline.scenes.findIndex((s) => s.id === selected.id);

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[1.9fr_0.9fr] mb-5">
        <div className="bg-[color:var(--cinema)] rounded-[12px] p-3">
          <div className="relative h-[302px] rounded-[10px] overflow-hidden">
            <Image src={selected.asset.src} alt="" fill className="object-cover" sizes="695px" />
          </div>
          <div className="bg-[color:var(--primary)] text-white rounded-[7px] px-5 py-3 mt-2">
            <div className="serif text-[30px]">{timeline.displayName}</div>
          </div>
          <p className="text-white px-2 py-3 m-0">
            {timeline.width}×{timeline.height} · seed {timeline.seed} · v{version}
          </p>
        </div>
        <Card className="!p-6">
          <h3 className="serif text-[29px] m-0 mb-2">Fine adjustments</h3>
          <p className="text-[12px] text-[color:var(--muted)] mb-5" role="status" aria-live="polite">
            {autosaveLabel(saveUi)}
          </p>
          <div className="mb-5">
            <div className="text-[13px] text-[color:var(--muted)] mb-1">Film ratio</div>
            <div className="font-medium text-[16px] mb-2">{aspect}</div>
            <div className="flex flex-wrap gap-2">
              {(['16:9', '9:16', '1:1'] as const).map((value) => (
                <Button
                  key={value}
                  variant="secondary"
                  disabled={pending || aspect === value || saveUi === 'conflict'}
                  onClick={() => runPatch({ op: 'set_aspect', aspect: value }, `Aspect set to ${value}.`)}
                >
                  {value}
                </Button>
              ))}
            </div>
          </div>
          <div className="mb-5">
            <div className="text-[13px] text-[color:var(--muted)] mb-1">Transition</div>
            <div className="font-medium text-[16px] mb-2">{selected.transitionIn}</div>
            <div className="flex flex-wrap gap-2">
              {(['fade', 'dissolve', 'none'] as const).map((transitionIn) => (
                <Button
                  key={transitionIn}
                  variant="secondary"
                  disabled={pending || saveUi === 'conflict'}
                  onClick={() =>
                    runPatch(
                      { op: 'set_transition', sceneId: selected.id, transitionIn },
                      `${transitionIn} transition applied.`,
                    )
                  }
                >
                  {transitionIn}
                </Button>
              ))}
            </div>
          </div>
          <div className="mb-5">
            <div className="text-[13px] text-[color:var(--muted)] mb-1">This scene’s length</div>
            <div className="font-medium text-[16px] mb-2">
              {(selected.durationFrames / timeline.fps).toFixed(1)} seconds
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={pending || saveUi === 'conflict'}
                onClick={() =>
                  runPatch(
                    {
                      op: 'set_duration',
                      sceneId: selected.id,
                      durationFrames: Math.max(60, selected.durationFrames - 30),
                    },
                    'Scene shortened.',
                  )
                }
              >
                Shorter
              </Button>
              <Button
                variant="secondary"
                disabled={pending || saveUi === 'conflict'}
                onClick={() =>
                  runPatch(
                    {
                      op: 'set_duration',
                      sceneId: selected.id,
                      durationFrames: Math.min(240, selected.durationFrames + 30),
                    },
                    'Scene lengthened.',
                  )
                }
              >
                Longer
              </Button>
            </div>
          </div>
          <div className="mb-4">
            <div className="text-[13px] text-[color:var(--muted)] mb-1">Reorder</div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={pending || selectedIndex <= 0 || saveUi === 'conflict'}
                onClick={() =>
                  runPatch(
                    { op: 'move_scene', sceneId: selected.id, toIndex: Math.max(0, selectedIndex - 1) },
                    'Scene moved earlier.',
                  )
                }
              >
                Move earlier
              </Button>
              <Button
                variant="secondary"
                disabled={
                  pending || selectedIndex >= timeline.scenes.length - 1 || saveUi === 'conflict'
                }
                onClick={() =>
                  runPatch(
                    {
                      op: 'move_scene',
                      sceneId: selected.id,
                      toIndex: Math.min(timeline.scenes.length - 1, selectedIndex + 1),
                    },
                    'Scene moved later.',
                  )
                }
              >
                Move later
              </Button>
            </div>
          </div>
          <Button
            variant="ghost"
            disabled={pending || !undoAvailable}
            onClick={() => runPatch({ op: 'undo' }, 'Last change undone.')}
          >
            Undo
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

      <div className="text-[12px] font-bold text-[color:var(--accent)] mb-3">TIMELINE   ·   PRECISE CONTROL</div>
      <Card className="!p-5">
        <div className="flex items-center gap-4 overflow-x-auto">
          <div className="text-[13px] font-medium w-[88px] shrink-0">Film</div>
          {imageScenes.map((scene) => (
            <button
              key={scene.id}
              type="button"
              className={`relative w-[138px] h-[73px] shrink-0 rounded-[10px] overflow-hidden border-2 ${
                scene.id === selected.id ? 'border-[color:var(--accent)]' : 'border-transparent'
              }`}
              onClick={() => setSelectedId(scene.id)}
            >
              <Image src={scene.asset.src} alt="" fill className="object-cover" sizes="138px" />
            </button>
          ))}
        </div>
        <div className="text-[13px] text-[color:var(--muted)] mt-4">
          Shared TimelineContract · optimistic concurrency · edits persist
        </div>
      </Card>
    </>
  );
}
