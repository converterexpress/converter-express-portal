# Whop invoice payments

Online invoice payment is disabled until `WHOP_PAYMENTS_ENABLED` is explicitly set to `true` and all three Supabase Edge Function secrets exist: `WHOP_COMPANY_ID`, `WHOP_COMPANY_API_KEY`, and `WHOP_WEBHOOK_SECRET`. Enter private credentials in Supabase, never in the frontend, Git, or chat. `WHOP_COMPANY_ID` must be the merchant account ID beginning with `biz_`.

## Customer flow

The invoice page loads Whop's Payment Element from `https://cdn.whop.com/elements/amber/elements.js`. It mounts both `PaymentElement` and Whop's required `BrandingElement`. The browser receives the merchant account ID and exact balance in cents, but never receives the company API key or webhook secret.

The browser sends the `ctok_` confirmation token produced by Whop Elements to `crm-api`. The API re-reads the invoice, verifies the signed-in shop owns it, verifies the reservation and exact balance, and creates the payment using the stored invoice amount. Whop may require an additional wallet, bank, or 3D Secure step; the browser completes it with the returned payment `client_secret`.

Payment creation is asynchronous. A browser success or return URL never marks an invoice paid. Only the signed webhook may close the invoice.

Register `www.converterexpress.net` as a Whop payment-method domain before enabling wallets or in-page bank linking. If a Content Security Policy is added later, allow Whop's documented frame and script sources and the payment methods' required sources.

## Webhook

Create a Whop webhook for payment success at:

`https://hjxhaxlthpqqktregwvu.supabase.co/functions/v1/whop-webhook`

The handler verifies the raw webhook signature, retrieves the payment from Whop, and verifies merchant, currency, exact invoice amount, payment ID or legacy checkout configuration, and invoice metadata. Replayed events do not credit an invoice twice.

## Release checks

The legacy hosted checkout remains available only when the Whop Elements script cannot load before an invoice payment reservation is created. Do not clear a reservation merely because a customer reports an error. Reconcile its reference in Whop first; this prevents a second charge after a network timeout.

Before customer activation:

1. Register and verify `www.converterexpress.net` as a payment-method domain in Whop.
2. Confirm the three secrets and `WHOP_PAYMENTS_ENABLED=true` in the Supabase Edge Function environment.
3. Deploy both `crm-api` and `whop-webhook`.
4. Complete one controlled provider test covering a successful payment, a required next action, a canceled wallet, and a duplicate webhook.
5. Confirm the invoice remains open until the webhook arrives, then closes once with payment method `Whop`.

The hosted checkout compatibility API remains pinned to `Api-Version-Date: 2026-09-29`. The Payment Element create/retrieve requests use `Api-Version-Date: 2026-10-08`, matching the current upcoming Payment Elements documentation. Both flows use the invoice reservation reference as the idempotency key.

Refunds and disputes require manual reconciliation; this integration does not automatically reverse invoices on refund events.

Official references:

- https://docs.whop.com/elements/upcoming/payments/payment
- https://docs.whop.com/elements/upcoming/payments/overview
- https://docs.whop.com/api-reference/beta/payments/create-payment
- https://docs.whop.com/api-reference/payments/retrieve-payment
