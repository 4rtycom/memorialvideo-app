import {
  framesToSeconds,
  parseTimelineContract,
  totalDurationFrames,
  type TimelineContract,
} from '@memorialvideo/contracts';
import {
  orderedConsumerPacks,
  resolvePackForFilmDuration,
  type PackDurationRecommendation,
  type ProposedPlanId,
} from '@memorialvideo/domain';

import { getTribute, updateTribute, type Tribute } from './store';

export function filmDurationSecondsFromTimeline(
  timeline: TimelineContract | null | undefined,
): number {
  if (!timeline) {
    return 0;
  }
  return framesToSeconds(totalDurationFrames(timeline), timeline.fps);
}

export function filmDurationSecondsFromTribute(tribute: Tribute | null): number {
  if (!tribute?.timeline) {
    return 0;
  }
  try {
    const timeline = parseTimelineContract(tribute.timeline);
    return filmDurationSecondsFromTimeline(timeline);
  } catch {
    return 0;
  }
}

export function recommendPackForTribute(tribute: Tribute | null): PackDurationRecommendation | null {
  if (!tribute) {
    return null;
  }
  return resolvePackForFilmDuration({
    filmDurationSeconds: filmDurationSecondsFromTribute(tribute),
    selectedPlanId: tribute.selectedConsumerPackId,
  });
}

export type ConsumerPackView = {
  recommendation: PackDurationRecommendation;
  plans: ReturnType<typeof orderedConsumerPacks>;
};

/**
 * Resolve pack recommendation and persist auto-upgrade when duration crosses
 * 8:00 or 20:00. Never charges — checkout remains stripe_not_wired.
 */
export async function syncConsumerPackForFilmDuration(
  publicId: string,
): Promise<{ tribute: Tribute; view: ConsumerPackView } | null> {
  const tribute = await getTribute(publicId);
  if (!tribute) {
    return null;
  }
  const recommendation = resolvePackForFilmDuration({
    filmDurationSeconds: filmDurationSecondsFromTribute(tribute),
    selectedPlanId: tribute.selectedConsumerPackId,
  });
  const plans = orderedConsumerPacks();

  if (tribute.selectedConsumerPackId !== recommendation.selectedPlanId) {
    const updated = await updateTribute(publicId, {
      selectedConsumerPackId: recommendation.selectedPlanId,
    });
    if (!updated) {
      return null;
    }
    return {
      tribute: updated,
      view: { recommendation, plans },
    };
  }

  return {
    tribute,
    view: { recommendation, plans },
  };
}

export async function selectConsumerPack(
  publicId: string,
  planId: ProposedPlanId,
): Promise<{ tribute: Tribute; view: ConsumerPackView } | null> {
  const tribute = await getTribute(publicId);
  if (!tribute) {
    return null;
  }
  // Duration floor still applies — cannot select below the required tier.
  const recommendation = resolvePackForFilmDuration({
    filmDurationSeconds: filmDurationSecondsFromTribute(tribute),
    selectedPlanId: planId,
  });
  const updated = await updateTribute(publicId, {
    selectedConsumerPackId: recommendation.selectedPlanId,
  });
  if (!updated) {
    return null;
  }
  return {
    tribute: updated,
    view: { recommendation, plans: orderedConsumerPacks() },
  };
}
