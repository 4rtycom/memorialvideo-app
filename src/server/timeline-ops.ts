import {
  dimensionsForAspect,
  parseTimelineContract,
  type OutputAspect,
  type TimelineContract,
  type Transition,
} from '@memorialvideo/contracts';
import {
  applyCaption,
  applyDuration,
  applyTransition,
  moveItem,
  replaceScene,
} from '@memorialvideo/domain';

export type TimelineEditOp =
  | { op: 'set_caption'; sceneId: string; caption: string }
  | { op: 'set_duration'; sceneId: string; durationFrames: number }
  | { op: 'set_transition'; sceneId: string; transitionIn: Transition }
  | { op: 'move_scene'; sceneId: string; toIndex: number }
  | { op: 'set_aspect'; aspect: OutputAspect }
  | { op: 'replace_image'; sceneId: string; assetId: string; src: string };

export function applyTimelineOp(
  timeline: TimelineContract,
  edit: TimelineEditOp,
): TimelineContract {
  const current = parseTimelineContract(timeline);

  if (edit.op === 'set_aspect') {
    const dims = dimensionsForAspect(edit.aspect);
    return parseTimelineContract({
      ...current,
      width: dims.width,
      height: dims.height,
    });
  }

  if (edit.op === 'move_scene') {
    const from = current.scenes.findIndex((s) => s.id === edit.sceneId);
    if (from < 0) {
      return current;
    }
    return parseTimelineContract({
      ...current,
      scenes: moveItem(current.scenes, from, edit.toIndex),
    });
  }

  const scene = current.scenes.find((s) => s.id === edit.sceneId);
  if (!scene) {
    return current;
  }

  if (edit.op === 'set_caption') {
    return parseTimelineContract(replaceScene(current, edit.sceneId, applyCaption(scene, edit.caption)));
  }
  if (edit.op === 'set_duration') {
    return parseTimelineContract(
      replaceScene(current, edit.sceneId, applyDuration(scene, edit.durationFrames)),
    );
  }
  if (edit.op === 'set_transition') {
    return parseTimelineContract(
      replaceScene(current, edit.sceneId, applyTransition(scene, edit.transitionIn)),
    );
  }
  if (edit.op === 'replace_image') {
    if (scene.type !== 'image') {
      return current;
    }
    return parseTimelineContract(
      replaceScene(current, edit.sceneId, {
        ...scene,
        asset: { ...scene.asset, assetId: edit.assetId, src: edit.src },
      }),
    );
  }
  return current;
}

