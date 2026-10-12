import { parseTimelineContract, type TimelineContract } from '@memorialvideo/contracts';

export function absolutizeTimeline(timeline: TimelineContract, origin: string): TimelineContract {
  const base = origin.replace(/\/$/, '');
  return parseTimelineContract({
    ...timeline,
    scenes: timeline.scenes.map((scene) => {
      if (scene.type !== 'image' && scene.type !== 'video') {
        return scene;
      }
      const src = scene.asset.src;
      if (
        src.startsWith('http://') ||
        src.startsWith('https://') ||
        src.startsWith('data:') ||
        src.startsWith('blob:')
      ) {
        return scene;
      }
      const path = src.startsWith('/') ? src : `/${src}`;
      return {
        ...scene,
        asset: { ...scene.asset, src: `${base}${path}` },
      };
    }),
  });
}
