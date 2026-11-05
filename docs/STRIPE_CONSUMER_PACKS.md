# Stripe consumer pack checkout (Gate A / MV-AUD-001)

Approved packs (Glenn 2026-10-27):

| Pack | Amount | Minutes | Uploads | Env Price ID |
| --- | --- | --- | --- | --- |
| Memorial Tribute | €29 | 10 | 120 | `STRIPE_PRICE_MEMORIAL_TRIBUTE` |
| Life Story | €49 | 20 | 250 | `STRIPE_PRICE_LIFE_STORY` |
| Forever Legacy | €79 | 40 | 500 | `STRIPE_PRICE_FOREVER_LEGACY` |

Duration upgrades (no silent charge): film **> 10:00** → Life Story; **> 20:00** → Forever Legacy.

## Required environment

```bash
STRIPE_SECRET_KEY=sk_test_…          # or sk_live_…
STRIPE_WEBHOOK_SECRET=whsec_…
STRIPE_PRICE_MEMORIAL_TRIBUTE=price_…
STRIPE_PRICE_LIFE_STORY=price_…
STRIPE_PRICE_FOREVER_LEGACY=price_…
NEXT_PUBLIC_APP_URL=https://your-app.example
```

Optional legacy fallback: `STRIPE_MEMORIAL_PACK_PRICE_ID` is used only when `STRIPE_PRICE_MEMORIAL_TRIBUTE` is unset. All three pack Price IDs must still be present for `stripeConfigured=true`.

Without these secrets the app stays honest:

- `APP_ENV=local` → local fake fulfill only (not paid COMPLETE)
- preview / staging / production → `503 stripe_not_configured` with `requiredEnv` listed (XB-005)

## Stripe Dashboard setup

1. Create three **one-time** Products (EUR):
   - Memorial Tribute — €29.00
   - Life Story — €49.00
   - Forever Legacy — €79.00
2. Copy each Price id (`price_…`) into the env vars above.
3. Add a webhook endpoint: `https://<host>/api/checkout/webhook`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `checkout.session.async_payment_failed`, `charge.refunded`, `charge.dispute.created`
4. Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`.
5. Redeploy / restart so the process picks up env (do not invent secrets in code).

## Runtime flow

1. Family selects a pack on `/share` (duration floor still applies).
2. `POST /api/checkout` with `consumerPackId` creates a PENDING order and a Stripe Checkout Session for that pack’s Price id. Metadata includes `consumer_pack_id`.
3. Entitlement (`ceremony` / Memorial Pack) is granted **only** by the signed webhook — never by the success redirect.
4. Paid webhook also persists `selectedConsumerPackId` on the tribute.

## Verification checklist (before calling paid launch ready)

- [ ] Test-mode Checkout completes for each of the three Price IDs
- [ ] Webhook grants entitlement; replay is idempotent
- [ ] Cancel / expire leaves entitlement inactive
- [ ] Production host without secrets returns `stripe_not_configured` (no fake paid COMPLETE)
- [ ] Film over 10:00 / 20:00 auto-selects Life Story / Forever Legacy before charge
