# Whop invoice payments

Checkout is disabled until provider tests pass and `WHOP_PAYMENTS_ENABLED` is explicitly set to `true`, with all three Supabase Edge Function secrets exist: `WHOP_COMPANY_ID`, `WHOP_COMPANY_API_KEY`, and `WHOP_WEBHOOK_SECRET`. Enter private credentials in Supabase, never in the frontend, Git, or chat. Use the merchant company ID beginning `biz_`.

Create a Whop webhook for payment success at:
`https://hjxhaxlthpqqktregwvu.supabase.co/functions/v1/whop-webhook`

The handler verifies the raw webhook signature, retrieves the payment from Whop, verifies merchant, currency, exact invoice amount, metadata and checkout configuration, then records payment and closes the invoice. Returning to the website does not mark an invoice paid. Replayed events do not credit the invoice twice.

Before customer activation, verify checkout creation and payment retrieval against the current Whop account/API, including the single-purchase stock limit, and complete a controlled payment and duplicate-event test using provider test facilities. Automated tests here use mocks; no live charge has been made. Production API requests use `api.whop.com/api/v1` and pin `Api-Version-Date: 2026-09-29`, matching the published Whop SDK 2.2.0 schema. Checkout creation uses the reservation reference as its idempotency key and creates a hidden single-purchase plan.

If checkout creation times out, the reserved invoice remains locked to prevent a duplicate checkout. An operator must reconcile its reference in Whop before clearing a failed reservation. Do not reset a reservation merely because a customer reports an error. Review repeated charges or changed invoices in Whop; the handler flags these for reconciliation rather than over-crediting an invoice. Refunds and disputes require manual reconciliation; this integration does not automatically reverse invoices on refund events.

Official references: https://docs.whop.com/api-reference/checkout-configurations/create-checkout-configuration and https://docs.whop.com/api-reference/payments/retrieve-payment
