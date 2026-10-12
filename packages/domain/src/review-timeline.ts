import { parseTimelineContract, type TimelineContract } from '@memorialvideo/contracts';

const REVIEW_PLACEHOLDER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export function reviewableTimeline(timeline: unknown): TimelineContract {
  const parsed = parseTimelineContract(timeline);
  return {
    ...parsed,
    watermark: true,
    scenes: parsed.scenes.map((scene) => {
      if (scene.type !== 'image' && scene.type !== 'video') {
        return scene;
      }
      return {
        ...scene,
        asset: {
          ...scene.asset,
          src: REVIEW_PLACEHOLDER,
        },
      };
    }),
  };
}
