import {
  IMAGE_DEFAULT_FRAMES,
  IMAGE_MAX_FRAMES,
  IMAGE_MIN_FRAMES,
  cropSchema,
  type Crop,
  type TimelineContract,
  type TimelineScene,
  type Transition,
} from '@memorialvideo/contracts';

export function clampImageDuration(frames: number): number {
  return Math.min(IMAGE_MAX_FRAMES, Math.max(IMAGE_MIN_FRAMES, Math.round(frames)));
}

export function applyCaption(scene: TimelineScene, caption: string): TimelineScene {
  const text = caption.trim().slice(0, 180);
  if (scene.type !== 'image' && scene.type !== 'video' && scene.type !== 'quote') {
    return scene;
  }
  if (scene.type === 'quote') {
    return { ...scene, text: text || scene.text };
  }
  return { ...scene, caption: text || undefined };
}

export function applyCrop(scene: TimelineScene, crop: Crop): TimelineScene {
  if (scene.type !== 'image') {
    return scene;
  }
  return { ...scene, crop: cropSchema.parse(crop) };
}

export function applyDuration(scene: TimelineScene, frames: number): TimelineScene {
  const durationFrames = scene.type === 'image' ? clampImageDuration(frames) : Math.max(30, Math.round(frames));
  return { ...scene, durationFrames };
}

export function applyTransition(scene: TimelineScene, transitionIn: Transition): TimelineScene {
  return { ...scene, transitionIn };
}

export function replaceScene(timeline: TimelineContract, sceneId: string, next: TimelineScene): TimelineContract {
  return {
    ...timeline,
    scenes: timeline.scenes.map((scene) => (scene.id === sceneId ? next : scene)),
  };
}

export type TimelineUndoState = {
  past: TimelineContract[];
  present: TimelineContract;
  future: TimelineContract[];
};

export function pushTimelineEdit(state: TimelineUndoState, next: TimelineContract): TimelineUndoState {
  return {
    past: [...state.past, state.present].slice(-40),
    present: next,
    future: [],
  };
}

export function undoTimeline(state: TimelineUndoState): TimelineUndoState {
  const previous = state.past.at(-1);
  if (!previous) {
    return state;
  }
  return {
    past: state.past.slice(0, -1),
    present: previous,
    future: [state.present, ...state.future],
  };
}

export function redoTimeline(state: TimelineUndoState): TimelineUndoState {
  const [next, ...rest] = state.future;
  if (!next) {
    return state;
  }
  return {
    past: [...state.past, state.present],
    present: next,
    future: rest,
  };
}

export { IMAGE_DEFAULT_FRAMES };
