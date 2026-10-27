'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { LaunchLanguage } from '@memorialvideo/contracts';
import { MEMORIAL_PACK_PACKAGE_KEY, type ProposedPlanId } from '@memorialvideo/domain';
import { Button, ErrorState } from '@/components/ui';
import { creatorT } from '@/lib/creator-ui-messages';

function newOrderId(): string {
  return `ord_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

type PanelMode = 'local_fake' | 'stripe' | 'unavailable';

export type PackRecommendationView = {
  selectedPlanId: ProposedPlanId;
  requiredPlanId: ProposedPlanId;
  reason: 'within_allowance' | 'over_ten_minutes' | 'over_twenty_minutes';
  autoUpgraded: boolean;
  previousPlanId: ProposedPlanId | null;
  filmDurationSeconds: number;
  filmClock: string;
  exceedsTopTierAllowance: boolean;
  checkoutBlock: 'stripe_not_wired';
  plans: Array<{
    id: ProposedPlanId;
    displayName: string;
    amountEur: number;
    filmMinutes: number;
  }>;
};

function upgradeExplanation(
  locale: LaunchLanguage,
  recommendation: PackRecommendationView,
): string | null {
  if (!recommendation.autoUpgraded) {
    return null;
  }
  if (recommendation.reason === 'over_twenty_minutes') {
    return creatorT(locale, 'creator.pack.upgradeOver20');
  }
  if (recommendation.reason === 'over_ten_minutes') {
    return creatorT(locale, 'creator.pack.upgradeOver10');
  }
  return null;
}

export function MemorialPackPanel({
  active,
  localFulfillAllowed,
  stripeConfigured,
  locale = 'en',
  projectPublicId,
  packRecommendation = null,
}: {
  active: boolean;
  localFulfillAllowed: boolean;
  stripeConfigured: boolean;
  locale?: LaunchLanguage;
  projectPublicId?: string;
  packRecommendation?: PackRecommendationView | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [stripeNotWired, setStripeNotWired] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<ProposedPlanId>(
    packRecommendation?.selectedPlanId ?? 'memorial-tribute',
  );

  const mode: PanelMode = stripeConfigured
    ? 'stripe'
    : localFulfillAllowed
      ? 'local_fake'
      : 'unavailable';

  /** Approved consumer packs stay unwired — never offer a silent charge path. */
  const consumerPackCheckoutBlocked = Boolean(packRecommendation);

  const explanation = packRecommendation ? upgradeExplanation(locale, packRecommendation) : null;
  const selectedPlan =
    packRecommendation?.plans.find((plan) => plan.id === selectedPlanId) ??
    packRecommendation?.plans.find((plan) => plan.id === packRecommendation.selectedPlanId);

  function fulfillLocal() {
    setError(null);
    setMessage(null);
    setUnavailable(false);
    setStripeNotWired(false);
    startTransition(async () => {
      const response = await fetch('/api/checkout/local-fulfill', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(projectPublicId ? { projectPublicId } : {}),
      });
      if (!response.ok) {
        setError(creatorT(locale, 'creator.pack.checkoutFailed'));
        return;
      }
      setMessage(creatorT(locale, 'creator.pack.active'));
      router.refresh();
    });
  }

  function selectPlan(planId: ProposedPlanId) {
    setError(null);
    setMessage(null);
    setStripeNotWired(false);
    startTransition(async () => {
      const response = await fetch('/api/checkout/select-pack', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ planId, projectPublicId }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        recommendation?: { selectedPlanId?: ProposedPlanId };
      };
      if (!response.ok) {
        setError(creatorT(locale, 'creator.pack.checkoutFailed'));
        return;
      }
      if (body.recommendation?.selectedPlanId) {
        setSelectedPlanId(body.recommendation.selectedPlanId);
      } else {
        setSelectedPlanId(planId);
      }
      router.refresh();
    });
  }

  function startStripeCheckout() {
    setError(null);
    setMessage(null);
    setUnavailable(false);
    setStripeNotWired(false);
    startTransition(async () => {
      const origin = window.location.origin;
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          orderId: newOrderId(),
          packageKey: MEMORIAL_PACK_PACKAGE_KEY,
          consumerPackId: selectedPlanId,
          projectPublicId,
          successUrl: `${origin}/share?checkout=success`,
          cancelUrl: `${origin}/share?checkout=cancel`,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        checkoutUrl?: string;
        mode?: string;
        useLocalFulfill?: boolean;
      };
      if (response.status === 503 && body.error === 'stripe_not_wired') {
        setStripeNotWired(true);
        return;
      }
      if (response.status === 503 || body.error === 'stripe_not_configured') {
        setUnavailable(true);
        return;
      }
      if (!response.ok) {
        setError(creatorT(locale, 'creator.pack.checkoutFailed'));
        return;
      }
      if (body.checkoutUrl) {
        window.location.assign(body.checkoutUrl);
        return;
      }
      if (body.useLocalFulfill || body.mode === 'local_fake') {
        fulfillLocal();
        return;
      }
      setError(creatorT(locale, 'creator.pack.checkoutFailed'));
    });
  }

  if (active) {
    return (
      <div className="border-t border-[color:var(--border)] pt-5 mt-5">
        <h3 className="serif text-[23px] m-0 mb-2">
          {selectedPlan?.displayName ?? 'Memorial Pack'}
        </h3>
        <p className="text-[14px] text-[color:var(--muted)] m-0">{creatorT(locale, 'creator.pack.active')}</p>
        {packRecommendation ? (
          <p className="text-[13px] text-[color:var(--muted)] mt-2 mb-0">
            {creatorT(locale, 'creator.pack.filmLength')}: {packRecommendation.filmClock} ·{' '}
            {creatorT(locale, 'creator.pack.allowance')}: {selectedPlan?.filmMinutes ?? '—'} min
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="border-t border-[color:var(--border)] pt-5 mt-5">
      <h3 className="serif text-[23px] m-0 mb-2">{creatorT(locale, 'creator.pack.chooseTitle')}</h3>
      <p className="text-[14px] text-[color:var(--muted)] mb-4">{creatorT(locale, 'creator.pack.missing')}</p>

      {packRecommendation ? (
        <div className="mb-4">
          <p className="text-[13px] text-[color:var(--muted)] m-0 mb-3">
            {creatorT(locale, 'creator.pack.filmLength')}: {packRecommendation.filmClock}
          </p>
          {explanation ? (
            <p className="text-[14px] m-0 mb-3" role="status">
              {explanation}
            </p>
          ) : null}
          <div className="grid gap-2" role="radiogroup" aria-label={creatorT(locale, 'creator.pack.chooseTitle')}>
            {packRecommendation.plans.map((plan) => {
              const required = packRecommendation.requiredPlanId;
              const requiredIndex = packRecommendation.plans.findIndex((p) => p.id === required);
              const planIndex = packRecommendation.plans.findIndex((p) => p.id === plan.id);
              const tooLow = planIndex < requiredIndex;
              const selected = selectedPlanId === plan.id;
              return (
                <button
                  key={plan.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={pending || tooLow}
                  onClick={() => selectPlan(plan.id)}
                  className={`text-left rounded-[10px] border px-4 py-3 transition ${
                    selected
                      ? 'border-[color:var(--accent)] bg-[color:var(--cinema-panel)]'
                      : 'border-[color:var(--border)] bg-transparent'
                  } ${tooLow ? 'opacity-45' : ''}`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="serif text-[18px]">{plan.displayName}</span>
                    <span className="text-[14px]">€{plan.amountEur}</span>
                  </div>
                  <p className="text-[13px] text-[color:var(--muted)] m-0 mt-1">
                    {creatorT(locale, 'creator.pack.upToMinutes').replace('{minutes}', String(plan.filmMinutes))}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {mode === 'stripe' && !consumerPackCheckoutBlocked ? (
        <Button
          onClick={startStripeCheckout}
          variant="secondary"
          className={pending ? 'opacity-70 btn-block' : 'btn-block'}
        >
          {pending
            ? '…'
            : `${creatorT(locale, 'creator.pack.buyStripe')} · ${selectedPlan?.displayName ?? 'Memorial Pack'}  ↗`}
        </Button>
      ) : null}

      {mode === 'local_fake' ? (
        <Button
          onClick={fulfillLocal}
          variant="secondary"
          className={pending ? 'opacity-70 btn-block' : 'btn-block'}
        >
          {pending ? '…' : `${creatorT(locale, 'creator.pack.activateLocal')}  ↗`}
        </Button>
      ) : null}

      {(mode === 'stripe' && consumerPackCheckoutBlocked) || stripeNotWired ? (
        <ErrorState
          title={creatorT(locale, 'creator.pack.stripeNotWired')}
          body={creatorT(locale, 'creator.pack.stripeNotWiredBody')}
        />
      ) : null}

      {mode === 'unavailable' || unavailable ? (
        <ErrorState
          title={creatorT(locale, 'creator.pack.stripeUnavailable')}
          body={creatorT(locale, 'creator.pack.stripeUnavailableBody')}
          action={
            <Button
              onClick={() => {
                setUnavailable(false);
                if (stripeConfigured) {
                  startStripeCheckout();
                } else {
                  router.refresh();
                }
              }}
              variant="ghost"
              className="mt-1"
            >
              {creatorT(locale, 'creator.pack.retry')}
            </Button>
          }
        />
      ) : null}

      {mode === 'local_fake' ? (
        <p className="text-[13px] text-[color:var(--muted)] mt-3 mb-0">
          {creatorT(locale, 'creator.pack.localOnlyNote')}
        </p>
      ) : null}

      {message ? (
        <p className="text-[13px] mt-3 mb-0" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <ErrorState
          title={error}
          body={creatorT(locale, 'creator.pack.stripeUnavailableBody')}
          action={
            <Button
              onClick={mode === 'stripe' ? startStripeCheckout : fulfillLocal}
              variant="ghost"
              className="mt-1"
            >
              {creatorT(locale, 'creator.pack.retry')}
            </Button>
          }
        />
      ) : null}
    </div>
  );
}
