export function sceneSeed(seed: number, sceneId: string): number {
  let value = seed >>> 0;
  for (let index = 0; index < sceneId.length; index += 1) {
    value = (Math.imul(value, 33) + sceneId.charCodeAt(index)) >>> 0;
  }
  return value;
}

function easedProgress(frame: number, durationFrames: number): number {
  if (durationFrames <= 1) {
    return 0;
  }
  const linear = Math.min(1, Math.max(0, frame / (durationFrames - 1)));
  return linear * linear * (3 - 2 * linear);
}

export function kenBurnsScale(
  zoom: number,
  frame: number,
  durationFrames: number,
  seed: number,
  motionIntensity = 1,
): number {
  const intensity = Math.min(1.5, Math.max(0, motionIntensity));
  const travel = (seed % 2 === 0 ? 0.05 : -0.04) * intensity;
  return zoom * (1 + travel * easedProgress(frame, durationFrames));
}

export function kenBurnsShift(
  frame: number,
  durationFrames: number,
  seed: number,
  motionIntensity = 1,
): { x: number; y: number } {
  const intensity = Math.min(1.5, Math.max(0, motionIntensity));
  const progress = easedProgress(frame, durationFrames);
  const dirX = seed % 3 === 0 ? 1 : seed % 3 === 1 ? -1 : 0.35;
  const dirY = ((seed >>> 3) % 3 === 0 ? -1 : 0.7) * 0.65;
  return {
    x: Number((dirX * 2.1 * progress * intensity).toFixed(3)),
    y: Number((dirY * 1.4 * progress * intensity).toFixed(3)),
  };
}
