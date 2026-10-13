'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import type { LaunchLanguage, TimelineContract } from '@memorialvideo/contracts';
import type { AutosaveUiState } from '@memorialvideo/domain';
import { Button, Card } from '@/components/ui';
import { creatorT } from '@/lib/creator-ui-messages';
import { autosaveLabel, patchTimeline } from '@/lib/timeline-patch';

type MediaScene = Extract<TimelineContract['scenes'][number], { type: 'image' | 'video' }>;

export function GuidedEditor({
  timeline,
  timelineVersion,
  updatedAt,
  canUndo = false,
  locale,
}: {
  timeline: TimelineContract;
  timelineVersion: number;
  updatedAt: string;
  canUndo?: boolean;
  locale: LaunchLanguage;
}) {
  const router = useRouter();
  const mediaScenes = useMemo(
    () => timeline.scenes.filter((s): s is MediaScene => s.type === 'image' || s.type === 'video'),
    [timeline],
  );
  const [selectedId, setSelectedId] = useState(mediaScenes[0]?.id ?? '');
  const [caption, setCaption] = useState(mediaScenes[0]?.caption ?? '');
  const [version, setVersion] = useState(timelineVersion);
  const [clientUpdatedAt, setClientUpdatedAt] = useState(updatedAt);
  const [undoAvailable, setUndoAvailable] = useState(canUndo);
  const [pending, startTransition] = useTransition();
  const [saveUi, setSaveUi] = useState<AutosaveUiState>('local');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = mediaScenes.find((s) => s.id === selectedId) ?? mediaScenes[0];
  const selectedIndex = selected ? mediaScenes.findIndex((scene) => scene.id === selected.id) : -1;

  function select(scene: MediaScene) {
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
          setError(creatorT(locale, 'creator.editor.conflict'));
        } else {
          setError(creatorT(locale, 'creator.editor.saveFailed'));
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
        <p className="m-0 text-[color:var(--muted)]">{creatorT(locale, 'creator.editor.empty')}</p>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[1.8fr_1fr] mb-4">
        <div className="bg-[color:var(--cinema)] rounded-[14px] p-3">
          <div className="relative h-[314px] rounded-[10px] overflow-hidden">
            {selected.type === 'image' ? (
              <Image src={selected.asset.src} alt="" fill className="object-cover" sizes="673px" />
            ) : (
              <div className="absolute inset-0 bg-[color:var(--cinema-soft)]" />
            )}
          </div>
          <div className="bg-[color:var(--primary)] text-white rounded-[8px] px-5 py-3 mt-2">
            <div className="serif text-[33px]">
              {selected.caption || creatorT(locale, 'creator.editor.fallbackCaption')}
            </div>
          </div>
          <p className="text-white/90 px-2 py-3 m-0">
            {Math.round((selected.durationFrames / timeline.fps) * 10) / 10}s · {selected.transitionIn}
          </p>
        </div>
        <Card className="!p-6">
          <h3 className="serif text-[31px] m-0 mb-3">{creatorT(locale, 'creator.editor.thisMoment')}</h3>
          <div className="text-[11px] font-bold text-[color:var(--accent)] mb-2">GUIDED  /  TIMELINECONTRACT</div>
          <p className="text-[12px] text-[color:var(--muted)] mb-4" role="status" aria-live="polite">
            v{version} · {autosaveLabel(saveUi)}
          </p>
          <p className="font-medium mb-2">{creatorT(locale, 'creator.editor.openingWords')}</p>
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
              runPatch(
                { op: 'set_caption', sceneId: selected.id, caption },
                creatorT(locale, 'creator.editor.captionSaved'),
              )
            }
          >
            {creatorT(locale, 'creator.editor.saveWords')}  ↗
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
                creatorT(locale, 'creator.editor.lengthened'),
              )
            }
          >
            {creatorT(locale, 'creator.editor.longer')}
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
                creatorT(locale, 'creator.editor.shortened'),
              )
            }
          >
            {creatorT(locale, 'creator.editor.shorter')}
          </Button>
          <Button
            variant="secondary"
            className="btn-block mb-3"
            disabled={pending || saveUi === 'conflict'}
            onClick={() =>
              runPatch(
                { op: 'set_transition', sceneId: selected.id, transitionIn: 'dissolve' },
                creatorT(locale, 'creator.editor.dissolved'),
              )
            }
          >
            {creatorT(locale, 'creator.editor.dissolve')}
          </Button>
          <Button
            variant="secondary"
            className="btn-block mb-3"
            disabled={pending || saveUi === 'conflict' || selectedIndex <= 0}
            onClick={() => {
              const neighbor = mediaScenes[selectedIndex - 1];
              if (!neighbor) return;
              const toIndex = timeline.scenes.findIndex((scene) => scene.id === neighbor.id);
              runPatch(
                { op: 'move_scene', sceneId: selected.id, toIndex },
                creatorT(locale, 'creator.editor.moved'),
              );
            }}
          >
            {creatorT(locale, 'creator.editor.moveEarlier')}
          </Button>
          <Button
            variant="secondary"
            className="btn-block mb-3"
            disabled={pending || saveUi === 'conflict' || selectedIndex < 0 || selectedIndex >= mediaScenes.length - 1}
            onClick={() => {
              const neighbor = mediaScenes[selectedIndex + 1];
              if (!neighbor) return;
              const toIndex = timeline.scenes.findIndex((scene) => scene.id === neighbor.id);
              runPatch(
                { op: 'move_scene', sceneId: selected.id, toIndex },
                creatorT(locale, 'creator.editor.moved'),
              );
            }}
          >
            {creatorT(locale, 'creator.editor.moveLater')}
          </Button>
          <Button
            variant="ghost"
            className="btn-block"
            disabled={pending || !undoAvailable}
            onClick={() => runPatch({ op: 'undo' }, creatorT(locale, 'creator.editor.undone'))}
          >
            {creatorT(locale, 'creator.editor.undo')}
          </Button>
          {saveUi === 'conflict' ? (
            <Button className="btn-block mt-3" onClick={() => router.refresh()}>
              {creatorT(locale, 'creator.editor.reload')}  ↗
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
        <div className="text-[11px] font-bold text-[color:var(--accent)]">
          {creatorT(locale, 'creator.editor.moments')}
        </div>
        <div className="text-[13px] text-[color:var(--muted)]">Saved on TimelineContract</div>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {mediaScenes.map((m, index) => (
          <button key={m.id} type="button" className="text-left" onClick={() => select(m)}>
            <Card className={`!p-2 ${m.id === selected.id ? '!bg-[color:var(--cinema-soft)]' : ''}`}>
              <div className="grid grid-cols-[93px_1fr] gap-3 items-center">
                <div className="relative h-[84px] rounded-[10px] overflow-hidden">
                  {m.type === 'image' ? (
                    <Image src={m.asset.src} alt="" fill className="object-cover" sizes="93px" />
                  ) : (
                    <div className="absolute inset-0 bg-[color:var(--cinema-soft)]" />
                  )}
                </div>
                <div>
                  <div className="text-[11px] font-bold text-[color:var(--accent)]">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <div className="serif text-[18px] leading-tight">
                    {m.caption || creatorT(locale, 'creator.editor.fallbackCaption')}
                  </div>
                </div>
              </div>
            </Card>
          </button>
        ))}
      </div>
    </>
  );
}
