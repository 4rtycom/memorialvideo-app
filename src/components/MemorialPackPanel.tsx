'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { LaunchLanguage } from '@memorialvideo/contracts';
import { MEMORIAL_PACK_PACKAGE_KEY } from '@memorialvideo/domain';
import { Button, ErrorState } from '@/components/ui';
import { creatorT } from '@/lib/creator-ui-messages';

function newOrderId(): string {
  return `ord_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

type PanelMode = 'local_fake' | 'stripe' | 'unavailable';

export function MemorialPackPanel({
  active,
  localFulfillAllowed,
  stripeConfigured,
  locale = 'en',
  projectPublicId,
}: {
  active: boolean;
  localFulfillAllowed: boolean;
  stripeConfigured: boolean;
  locale?: LaunchLanguage;
  projectPublicId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const mode: PanelMode = stripeConfigured
    ? 'stripe'
    : localFulfillAllowed
      ? 'local_fake'
      : 'unavailable';

  function fulfillLocal() {
    setError(null);
    setMessage(null);
    setUnavailable(false);
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

  function startStripeCheckout() {
    setError(null);
    setMessage(null);
    setUnavailable(false);
    startTransition(async () => {
      const origin = window.location.origin;
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          orderId: newOrderId(),
          packageKey: MEMORIAL_PACK_PACKAGE_KEY,
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
        <h3 className="serif text-[23px] m-0 mb-2">Memorial Pack</h3>
        <p className="text-[14px] text-[color:var(--muted)] m-0">{creatorT(locale, 'creator.pack.active')}</p>
      </div>
    );
  }

  return (
    <div className="border-t border-[color:var(--border)] pt-5 mt-5">
      <h3 className="serif text-[23px] m-0 mb-2">Memorial Pack</h3>
      <p className="text-[14px] text-[color:var(--muted)] mb-4">{creatorT(locale, 'creator.pack.missing')}</p>

      {mode === 'stripe' ? (
        <Button
          onClick={startStripeCheckout}
          variant="secondary"
          className={pending ? 'opacity-70 btn-block' : 'btn-block'}
        >
          {pending ? '…' : `${creatorT(locale, 'creator.pack.buyStripe')}  ↗`}
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
