# Payment-first checkout release runbook

## Preconditions

- Back up the Supabase database and export the current workspace JSON.
- Confirm `WHOP_PAYMENTS_ENABLED=false` until the migrations and Edge Functions are deployed.
- Confirm `WHOP_COMPANY_API_KEY`, `WHOP_COMPANY_ID`, `WHOP_WEBHOOK_SECRET`, `RESEND_API_KEY`, and `APP_ORIGINS` are present as hosted secrets. Never place their values in Git or frontend configuration.
- Have an authorized Whop test capability or an explicitly approved internal transaction. Do not charge a customer to test a deployment.

## Deployment order

1. Apply all Supabase migrations in timestamp order, including `202610090001_payment_lifecycle.sql` and `202610090002_quote_email.sql`.
2. Verify that `ce_private.checkout_reservations`, `ce_private.payment_events`, and `ce_private.quote_emails` deny `anon` and `authenticated` access, while the service role can execute their public RPCs.
3. Deploy `crm-api`, then deploy `whop-webhook`.
4. Configure the Whop webhook to the deployed `whop-webhook` URL and subscribe to successful payment events used by the current Whop API version.
5. Run `node supabase-app/scripts/build-static.cjs` and deploy `supabase-app/dist`.
6. Confirm the custom domain serves the new asset version before enabling payments.
7. Set `WHOP_PAYMENTS_ENABLED=true` and redeploy `crm-api`.

## Smoke checks

- Anonymous visitors can browse without seeing wholesale prices, customer data, or stock counts.
- An approved disposable shop can reach checkout; no order or invoice number exists before payment.
- A successful authorized payment produces one paid order after the signed webhook arrives. Refreshing or double-clicking does not create a second order or payment session.
- Processing and review states tell the customer not to pay again.
- A failed or expired reservation creates no order and can be replaced by a newly priced reservation.
- Admin order creation and legacy unpaid invoice payment remain available.
- Admins can request a full or partial refund, record only a verified Whop result, or explicitly retain payment; customers cannot access those commands.
- Quote and order emails show provider acceptance without claiming inbox delivery.

## Monitoring

- Watch Edge Function errors, rate-limit rejections, reservation states older than their expiry, `REVIEW` reservations, and unapplied `payment_events`.
- Reconcile every Whop payment against a confirmed order or documented review item.
- Check Resend for `unknown` email attempts before retrying.

## Rollback

1. Set `WHOP_PAYMENTS_ENABLED=false` first. This prevents new payment sessions while preserving existing records.
2. Restore the previous frontend and Edge Function versions.
3. Do not drop payment, reservation, refund, event, or email tables. They are financial/audit history.
4. Leave successfully paid orders intact. Reconcile any `PROCESSING` or `REVIEW` reservation in Whop and the database before re-enabling checkout.
5. Restore the workspace backup only if no newer paid order or verified financial event would be lost.

## External verification still required

Local tests do not prove live Whop settlement/refund behavior, hosted migration grants, webhook delivery, Resend inbox delivery, DNS, or legal sufficiency. Record those results during staging with disposable accounts and authorized recipients.
