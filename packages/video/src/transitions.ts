import type { Transition } from '@memorialvideo/contracts';

export function transitionHoldFrames(transition: Transition): number {
  if (transition === 'none') {
    return 0;
  }
  return transition === 'dissolve' ? 16 : 10;
}

export function transitionOpacity(frame: number, transition: Transition): number {
  const hold = transitionHoldFrames(transition);
  if (hold === 0 || frame >= hold) {
    return 1;
  }
  return Math.min(1, Math.max(0, frame / hold));
}
