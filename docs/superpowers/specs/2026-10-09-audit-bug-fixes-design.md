# Audit Bug Fixes and Payment-First Checkout Design

**Date:** October 9, 2026  
**Status:** Approved conversational design; written specification pending user review  
**Scope:** Fix the seven confirmed bugs in `docs/SHOP_OWNER_AUDIT.md` and require verified payment before confirming customer online orders.

## 1. Goals

This release will:

1. Replace public draft and contradictory legal/payment copy with accurate Converter Express, Whop, shipping, return, warranty, and privacy disclosures. The customer-facing pages will not display a draft warning.
2. Export the actual recorded invoice payment method rather than the literal `Card`.
3. Replace direct cancellation of paid orders with an administrator-reviewed cancellation and refund workflow supporting full and partial refunds.
4. Email quotes to customers while leaving acceptance/decline status under administrator control.
5. Remove preview-only authentication and persistence copy/code from the production bundle.
6. Recover safely from expired or failed Whop checkout reservations.
7. Require verified payment before a customer online order becomes a confirmed order.

The release will preserve admin-created phone/walk-in orders. Staff may record those using cash, check, bank transfer, ACH, Zelle, Whop, another approved method, or account terms.

## 2. Non-Goals

- Customer-controlled quote acceptance or electronic signatures.
- Automatic refunds immediately upon clicking Cancel.
- Appointments, technicians, repair orders, digital inspections, or other full shop-management capabilities.
- Replacing the JSON workspace architecture in this release.
- General accounting integration.
- Claiming attorney review of the legal pages. Legal review remains an internal launch task.

## 3. Terminology and State Rules

### Customer checkout

A **checkout reservation** is a temporary server-owned record created before Whop payment. It contains the authenticated shop, immutable server quote, stock quantities, fulfillment details, expiration, idempotency key, and payment reference. It is not an order or invoice.

A **confirmed customer order** exists only after the server retrieves and verifies a successful Whop payment and atomically converts the valid reservation into a paid order.

### Cancellation and refunds

A **cancellation review** is the administrator decision record for a paid or partially paid order. It may request:

- full refund;
- partial refund; or
- cancellation without refund, with a required explanation.

A **refund record** is an immutable record of the requested amount, Whop refund identifier, provider state, actor, timestamps, idempotency key, and failure/review information.

`paymentStatus` continues to represent collection state. Refund state is recorded separately so the system never rewrites history to imply the original collection did not happen.

## 4. Architecture

### 4.1 Persistent data

Add private relational tables for temporary checkout reservations and provider events rather than placing pre-order payments only inside the workspace JSON document.

#### `ce_private.checkout_reservations`

- `id uuid primary key`
- `user_id uuid not null`
- `shop_email text not null`
- `status text not null` constrained to `CREATING`, `READY`, `PROCESSING`, `PAID`, `EXPIRED`, `FAILED`, `REVIEW`
- `quote jsonb not null`
- `request_hash text not null`
- `payment_reference text unique not null`
- `whop_payment_id text unique null`
- `amount_cents bigint not null`
- `expires_at timestamptz not null`
- `created_at`, `updated_at`
- `confirmed_order_id text null`
- `failure_code`, `failure_message` nullable and length limited

Only service-role functions may read or mutate the table. The browser receives a limited reservation projection through the Edge Function.

#### `ce_private.payment_events`

Store a deduplicated provider event ID, type, relevant business reference, sanitized payload subset, processing result, and timestamps. Do not store card details or unnecessary provider payload fields.

#### Workspace order additions

Existing orders remain compatible. New fields are optional:

- `paymentHistory[]` retains original collections.
- `refunds[]` contains immutable refund attempts and results.
- `cancellationReview` contains reason, requested action/amount, requester, reviewer, status, and timestamps.
- `cancelledAt`, `cancelledBy`, `cancellationReason` preserve the final decision.
- `quoteEmailHistory[]` may be stored on quotes for provider acceptance/rejection history.

### 4.2 Server boundaries

The browser never supplies authoritative totals, merchant identity, maximum refundable amount, payment ID, or order confirmation state.

The Edge Function will:

- build customer quotes from the authenticated account, current catalog, stock, settings, and discounts;
- create/reuse checkout reservations by idempotency key;
- calculate reserved stock using confirmed orders plus active, unexpired checkout reservations;
- create Whop Payment Elements sessions from the exact reservation amount;
- verify Whop events by signature and retrieve the canonical payment before applying it;
- atomically commit one paid order and mark one reservation paid;
- calculate refundable balance from verified receipt/refund history;
- submit full or partial refunds idempotently;
- place ambiguous provider outcomes in `REVIEW` without changing financial totals;
- authorize every cancellation/refund/clear action as staff-only.

### 4.3 Payment-first customer order flow

1. Customer submits checkout using an idempotency key.
2. Server validates account approval, products, quantities, prices, delivery, discount, tax, and available stock.
3. Server creates or returns an equivalent unexpired reservation. A reused key with a changed payload is rejected.
4. Server creates the Whop payment session using the reservation amount.
5. Browser presents Payment Elements and labels the state **Payment required**.
6. After confirmation, browser labels the state **Payment processing** and polls/reloads the reservation status. It must not display an order number yet.
7. Verified Whop success triggers server-side finalization. In one controlled transaction or compare-and-swap sequence, the server revalidates the reservation, prevents duplicate finalization, creates one paid order/invoice, reserves inventory, records the receipt, and links the order to the reservation.
8. Browser receives the confirmed order ID and navigates to the order confirmation.
9. Failed or expired reservations do not create an order. Expiration releases their stock reservation.

If finalization cannot safely complete after a verified payment, the reservation enters `REVIEW`. The customer sees that payment is being reviewed and receives contact guidance. The system must never ask the customer to pay again while a verified or ambiguous payment is under review.

### 4.4 Legacy unpaid invoices

Existing unpaid invoices keep their current invoice-payment capability. New customer online checkout uses the reservation flow. Admin-created orders may be unpaid or partially paid according to staff-entered payment terms.

### 4.5 Admin cancellation and refund flow

#### Unpaid order

An administrator supplies a reason, previews stock/fulfillment impact, and confirms cancellation. The system records the actor and timestamp. No refund record is created.

#### Paid or partially paid order

1. **Cancel order** opens a review panel.
2. Admin enters a reason and chooses full refund, partial refund, or cancel without refund.
3. Server calculates collected, previously refunded, refundable, proposed refund, and retained amounts.
4. The UI shows this calculation before confirmation.
5. Full and partial refunds are submitted to Whop with a stable idempotency key. The requested amount cannot exceed verified refundable balance.
6. A confirmed provider refund appends an immutable refund record and applies the cancellation decision.
7. A rejected refund leaves the order active unless the admin explicitly selected and confirmed a permitted cancellation-without-refund path.
8. A timeout or ambiguous provider result records `REVIEW`; it does not retry with a new key and does not change financial totals.
9. Reinstatement is blocked after any confirmed refund. A cancelled order with no refund may be reinstated only if stock and payment constraints still pass.

“Cancel without refund” always requires an explanation and a second confirmation. The UI must state the retained amount plainly.

### 4.6 Checkout recovery

- Reservations have a server-defined expiration.
- `CREATING`, `READY`, or explicit `FAILED` reservations may be resumed or safely restarted using their existing idempotency identity.
- Expired reservations release stock and may be replaced by a new reservation.
- `PROCESSING`, `PAID`, or `REVIEW` reservations cannot be cleared by the browser.
- Admin may reconcile failed/expired reservations. Active or ambiguous payments require provider verification first.
- Scheduled cleanup marks expired reservations; it never deletes financial/event history.

### 4.7 Quote email

- Replace the ambiguous status-only action with **Email quote**.
- Use the existing branded Resend pattern and a stable idempotency key.
- Record provider accepted/rejected/unknown state, recipient, provider ID when available, timestamp, and issue.
- Provider acceptance is labeled accurately; it does not claim inbox delivery.
- Admin may retry rejected/unknown sends according to the existing email safety pattern.
- Quote status remains controlled by staff. `Accepted` and `Declined` are explicitly labeled as recorded by an administrator.

### 4.8 Legal and production copy

Terms and Privacy must describe:

- approved wholesale accounts;
- payment collection through Whop;
- payment-before-confirmation for customer online orders;
- admin-entered offline payment methods for phone/walk-in orders;
- order cancellation and administrator-reviewed full/partial refunds;
- shipping/pickup, delivery estimates, fitment responsibility, core charges, returns, warranty, and privacy categories;
- the actual business contact method and an effective date.

Remove customer-visible draft warnings. Do not say the pages were reviewed by counsel. Add an internal documentation item requiring legal review before broad launch.

The production build must not contain preview-only login, local-persistence implementations, or “saved on this computer” copy. Test fixtures remain under tests.

## 5. User Experience

### Customer

- Checkout separates **Review order**, **Payment required**, **Payment processing**, **Order confirmed**, **Payment failed**, and **Payment review required**.
- Only the confirmed screen contains an order/invoice number.
- Refreshing or retrying returns to the same reservation/order.
- The UI prevents duplicate payment submission while processing.
- Expired checkout explains that prices/stock will be rechecked.

### Administrator

- Cancellation uses a dedicated review panel rather than a direct mutation.
- The panel shows order total, collected, refunded, refundable, proposed refund, retained amount, fulfillment stage, and inventory impact.
- Refund and cancellation history appears on the order and invoice.
- Quotes show email status and separate admin-recorded acceptance status.
- Failed/expired checkout reservations appear in a payment review queue with safe available actions.

### Errors

Every financial error must state whether money may have moved:

- **No payment created:** customer may retry.
- **Payment processing:** customer must wait/reload and must not pay again.
- **Payment needs review:** customer contacts Converter Express; admin verifies provider state.
- **Refund rejected:** order remains unchanged.
- **Refund needs review:** financial totals remain unchanged until verified.

## 6. CSV and Reporting

- Export `order.paymentMethod` when recorded.
- Whop-confirmed online orders record `Whop`.
- Unpaid orders export an empty method.
- Partial payments export the current recorded method and payment status; future multi-tender reporting may require a separate payment export.
- Add refund amount and refund status columns so cancelled paid orders reconcile.
- Preserve CSV formula-injection protection.

## 7. Security and Data Integrity

- All financial commands require an authenticated live session; refund/cancellation review requires staff authorization.
- Customer identity and shop ownership come from verified auth claims and server account records.
- Amounts use safe integer cents.
- Provider events and commands are idempotent.
- Webhook signatures, merchant/account, currency, payment state, payment ID, amount, metadata, and reservation reference must match.
- Active reservation quantities participate in availability calculations.
- Expiration and finalization use database locking or an equivalent atomic RPC to prevent overselling and duplicate orders.
- Refund totals cannot exceed verified collected funds minus confirmed prior refunds.
- Admin saves cannot modify processor receipt, reservation, refund, or payment-review history.
- Audit records include action type, actor, business reference, and outcome without secrets or sensitive provider payloads.

## 8. Compatibility and Migration

- Existing orders without refund/cancellation fields render with empty histories.
- Existing Whop invoice checkouts continue to work for legacy invoices.
- Existing customer online orders remain as historical records; no backfill changes their confirmation semantics.
- Database migration and server functions deploy before the frontend.
- Frontend feature detection keeps checkout unavailable with a clear message until the new server capability is present.
- Rollback must not remove payment/refund records. The previous frontend may be restored only if it cannot mutate the new protected fields.

## 9. Testing Strategy

Follow red-green-refactor for every behavior change.

### Unit tests

- Reservation quote integrity, idempotency, expiry, stock inclusion, and payload-change rejection.
- Payment verification creates exactly one paid order.
- Failed, pending, wrong-merchant, wrong-currency, wrong-amount, refunded, duplicate, and mismatched payments create no order.
- Finalization failure after verified payment enters review and cannot charge again.
- Full/partial refund bounds, idempotency, provider verification, prior refunds, and ambiguous outcomes.
- Paid cancellation requires a reviewed financial outcome; unpaid cancellation does not create a refund.
- Reinstatement is blocked after refund.
- CSV methods/refund fields.
- Quote email delivery history and admin-recorded acceptance distinction.
- Production build excludes preview strings and functions.

### Browser tests

- Customer checkout cannot reach confirmed state or receive an order number before verified payment.
- Processing, success, failure, expiry, refresh, duplicate click, and review states.
- Admin cancellation review for unpaid, fully paid, and partially paid orders.
- Full refund, partial refund, cancellation without refund, rejected refund, and review state.
- Quote email preview/send/retry and manual acceptance.
- Invoice/order financial history on desktop and 320/390/430 px widths.
- Correct CSV download content.
- Legal pages contain accurate Whop language and no draft warning.

### Integration and production verification

- Run database authorization and migration tests against a disposable environment.
- Run the complete existing unit/browser suite.
- Verify Resend with an authorized internal test recipient only.
- Use a Whop test capability or the smallest explicitly authorized internal transaction if available. Never charge a customer for testing.
- Verify webhook retries and idempotency.
- Verify backup and restore before broad launch.

If live provider testing is unavailable, document that limitation and do not claim settlement/refund verification.

## 10. Rollout and Observability

1. Back up the workspace and private storage metadata.
2. Deploy migrations.
3. Deploy server functions with checkout finalization disabled.
4. Run migration/security/integration checks.
5. Deploy frontend and enable payment-first checkout for an internal account.
6. Verify successful and failed paths.
7. Enable customer checkout.
8. Monitor reservation states, webhook failures, payment reviews, refund reviews, email rejection, and finalization latency.

Alerts must identify the business reference and safe recovery action without logging API keys, tokens, full provider payloads, or customer license content.

## 11. Acceptance Criteria

- No customer online order is confirmed before verified payment.
- Failed or abandoned customer payments create no confirmed order.
- One verified payment creates no more than one order.
- Stock remains protected during active checkout and is released on expiration.
- Admin phone/walk-in orders retain offline methods and account terms.
- Paid cancellations cannot bypass administrator refund review.
- Full and partial refunds are bounded, idempotent, and accurately recorded.
- Ambiguous payment/refund outcomes never fabricate a final state.
- Quote email delivery and admin-recorded acceptance are visibly separate.
- CSV payment methods match saved records.
- Public legal pages contain no draft warning and accurately name Whop.
- Production assets contain no local-preview authentication/persistence claims.
- Existing records remain readable.
- All existing and new tests pass.

