# Cash and Check on Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cash and check on delivery to checkout while keeping orders unconfirmed until an administrator records full payment.

**Architecture:** Extend checkout reservations with an offline-payment lifecycle and admin-only atomic finalization. The customer UI selects Whop, cash, or check before reserving stock; the admin UI manages awaiting-delivery-payment requests and converts a paid request into one confirmed order. Existing Whop checkout and webhook behavior remain isolated.

**Tech Stack:** Static HTML/CSS/JavaScript, Supabase Edge Functions (TypeScript/Deno), PostgreSQL RPCs, Node test runner, Playwright with Chrome.

**Spec:** `docs/superpowers/specs/2026-10-11-cash-check-delivery-payments-design.md`

## Global Constraints

- A cash/check request is not a confirmed order or paid invoice until an authenticated administrator records full payment.
- Valid checkout methods are exactly `WHOP`, `CASH`, and `CHECK`.
- Inventory is reserved once when an offline request is submitted and released when it is cancelled.
- Customer-provided totals, discounts, taxes, delivery charges, and stock counts are never trusted.
- Offline requests never enter Whop session, payment, or webhook handlers.
- Finalization and cancellation are idempotent and record the administrator and timestamp.
- The customer-facing copy must say that cash/check payment is collected at delivery and confirmation happens afterward.

## Review Focus

- A stale browser reservation in `EXPIRED` or `FAILED` must return to method selection without mounting the Whop element.
- Two admins finalizing the same request concurrently must produce one order and one payment history entry.
- A customer attempting admin list, finalize, or cancel actions must receive `403` without changing data.
- A cancelled or finalized request must not continue holding inventory.
- Check reference may be blank, but a supplied value must be trimmed, bounded, stored, and shown in the invoice audit data.

---

### Task 1: Offline Reservation Domain Model

**Files:**
- Modify: `supabase-app/supabase/functions/_shared/checkout.mjs`
- Create: `supabase-app/tests/offline-checkout.test.mjs`

**Interfaces:**
- Produces: `buildCheckoutReservation(data, user, args, reservations, now)` accepting `args.paymentMethod` and returning a method-specific reservation.
- Produces: `buildOfflinePaidOrder(reservation, collection, orderId)` returning the same order shape used by `buildPaidOrder`.
- Produces: active-inventory behavior for `AWAITING_OFFLINE_PAYMENT` and no hold for `CANCELLED` or `PAID`.

- [ ] **Step 1: Write failing domain tests**

Add tests named `cash and check reservations use the server total`, `offline reservations hold stock until cancelled`, and `offline finalization builds one fully paid order`. Assert the exact methods, state, server amount, payment history actor/reference fields, and rejection of mismatched or partial collection amounts.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test supabase-app/tests/offline-checkout.test.mjs`

Expected: FAIL because offline method/state and finalization functions do not exist.

- [ ] **Step 3: Implement the domain interfaces**

Extend reservation activity and construction for `WHOP`, `CASH`, and `CHECK`. Add `buildOfflinePaidOrder(reservation, {method, amountCents, reference, actorId, collectedAt}, orderId)` with full-payment validation and the existing order/payment history shape.

- [ ] **Step 4: Run domain and existing checkout tests**

Run: `node --test supabase-app/tests/offline-checkout.test.mjs supabase-app/tests/checkout-first.test.mjs supabase-app/tests/payment-finalization.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase-app/supabase/functions/_shared/checkout.mjs supabase-app/tests/offline-checkout.test.mjs
git commit -m "feat: model delivery payment reservations"
```

### Task 2: Atomic Database Lifecycle

**Files:**
- Create: `supabase-app/supabase/migrations/202610110001_offline_delivery_payments.sql`
- Create: `supabase-app/tests/offline-payment-database.mjs`
- Modify: `supabase-app/tests/payment-lifecycle-database.test.mjs`

**Interfaces:**
- Consumes: offline reservation states and paid-order shape from Task 1.
- Produces: RPCs `ce_offline_checkout_list()`, `ce_offline_checkout_finalize(rid, method, amount, reference, actor, paid_order)`, and `ce_offline_checkout_cancel(rid, actor, reason)`.
- Produces: reservation columns for `payment_method`, `request_number`, collection audit fields, and cancellation audit fields.

- [ ] **Step 1: Write failing migration contract and disposable-database tests**

Assert that an offline request is admin-readable, customer-inaccessible through admin RPCs, finalized once, and cancelled once. Add a concurrent-finalization test that asserts exactly one confirmed order ID and no duplicate payment data.

- [ ] **Step 2: Run database tests and verify RED**

Run the configured disposable Supabase/Postgres test command for `supabase-app/tests/offline-payment-database.mjs` and `node --test supabase-app/tests/payment-lifecycle-database.test.mjs`.

Expected: FAIL because schema fields and RPCs are absent.

- [ ] **Step 3: Add the migration**

Extend the status constraint with `AWAITING_OFFLINE_PAYMENT` and `CANCELLED`; add bounded method, request, collection, and cancellation fields. Implement security-definer RPCs that lock the reservation row, validate transitions, write audit metadata, and return the existing finalized result for idempotent retries.

- [ ] **Step 4: Run database tests and verify GREEN**

Run the commands from Step 2.

Expected: PASS with one finalized order result and released cancelled inventory.

- [ ] **Step 5: Commit**

```bash
git add supabase-app/supabase/migrations/202610110001_offline_delivery_payments.sql supabase-app/tests/offline-payment-database.mjs supabase-app/tests/payment-lifecycle-database.test.mjs
git commit -m "feat: add offline delivery payment lifecycle"
```

### Task 3: Authenticated API and Notifications

**Files:**
- Modify: `supabase-app/supabase/functions/crm-api/index.ts`
- Modify: `supabase-app/supabase/functions/_shared/order-email.mjs`
- Modify: `supabase-app/tests/payment-first-api.test.mjs`
- Create: `supabase-app/tests/offline-payment-api.test.mjs`
- Modify: `supabase-app/tests/order-email.test.mjs`

**Interfaces:**
- Consumes: Task 1 builders and Task 2 RPCs.
- Produces: customer action `checkout-offline`; admin actions `offline-checkout-list`, `offline-checkout-finalize`, and `offline-checkout-cancel`.
- Produces: branded request-received, paid-confirmation, and cancellation email payloads.

- [ ] **Step 1: Write failing API authorization and email tests**

Assert strict request keys, only `CASH`/`CHECK` for `checkout-offline`, ownership checks, admin-only list/finalize/cancel, full-amount finalization, idempotent retry, server totals, and no calls into Whop helpers. Assert request-received wording does not say the order is confirmed.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test supabase-app/tests/offline-payment-api.test.mjs supabase-app/tests/payment-first-api.test.mjs supabase-app/tests/order-email.test.mjs`

Expected: FAIL because the actions and templates are missing.

- [ ] **Step 3: Implement API handlers and emails**

Route `checkout-offline` through the existing server reservation calculation, store `AWAITING_OFFLINE_PAYMENT`, and return `{reservation:{id,status,requestNumber,method,amountCents}}`. Add admin list/finalize/cancel handlers using the new RPCs; send notifications after commits and report notification failure without rolling back committed data.

- [ ] **Step 4: Run focused API, security, Whop, and email tests**

Run: `node --test supabase-app/tests/offline-payment-api.test.mjs supabase-app/tests/payment-first-api.test.mjs supabase-app/tests/security.test.mjs supabase-app/tests/whop.test.mjs supabase-app/tests/order-email.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase-app/supabase/functions/crm-api/index.ts supabase-app/supabase/functions/_shared/order-email.mjs supabase-app/tests/offline-payment-api.test.mjs supabase-app/tests/payment-first-api.test.mjs supabase-app/tests/order-email.test.mjs
git commit -m "feat: add offline payment API workflow"
```

### Task 4: Customer Checkout and Expired-Session Recovery

**Files:**
- Modify: `supabase-app/auth.js`
- Modify: `supabase-app/converter-express_1.html`
- Modify: `supabase-app/crm.css`
- Modify: `supabase-app/tests/payment-first-browser.cjs`
- Create: `supabase-app/tests/offline-checkout-browser.cjs`

**Interfaces:**
- Consumes: `checkout-offline` and existing Whop checkout actions from Task 3.
- Produces: a checkout payment selector and pending-request confirmation panel.
- Produces: expired/failed reservation recovery that clears stale session storage and restores the payment selector.

- [ ] **Step 1: Write failing browser tests**

Test desktop and mobile selection for Whop, cash, and check; duplicate-submit locking; cash/check success copy; no Whop mount for offline choices; and the screenshot regression where an expired reservation currently leaves `Loading secure payment…` visible.

- [ ] **Step 2: Run browser tests and verify RED**

Run with `PLAYWRIGHT_MODULE` set: `node supabase-app/tests/offline-checkout-browser.cjs` and `node supabase-app/tests/payment-first-browser.cjs`.

Expected: FAIL because the selector and expired-state recovery are missing.

- [ ] **Step 3: Implement customer checkout UI**

Render accessible method cards before payment submission. Route Whop to the existing element flow and cash/check to `checkout-offline`. On `EXPIRED` or `FAILED`, clear `ce-checkout-reservation`, remove any stale payment panel, restore the enabled selector, and preserve checkout form values.

- [ ] **Step 4: Style responsive states and run browser tests**

Add focused styles in `crm.css` for method cards, pending confirmation, focus, disabled, and mobile layout. Run both commands from Step 2 plus `node supabase-app/tests/mobile-fitment.cjs`.

Expected: PASS in Chrome at desktop and mobile viewport sizes.

- [ ] **Step 5: Commit**

```bash
git add supabase-app/auth.js supabase-app/converter-express_1.html supabase-app/crm.css supabase-app/tests/payment-first-browser.cjs supabase-app/tests/offline-checkout-browser.cjs
git commit -m "feat: offer cash and check at delivery"
```

### Task 5: Admin Delivery-Payment Queue and Invoice Audit

**Files:**
- Modify: `supabase-app/converter-express_1.html`
- Modify: `supabase-app/auth.js`
- Modify: `supabase-app/crm.css`
- Create: `supabase-app/tests/offline-payment-admin-browser.cjs`
- Modify: `supabase-app/tests/invoice-desk-browser.cjs`

**Interfaces:**
- Consumes: admin offline-payment actions from Task 3.
- Produces: route `#/admin/delivery-payments`, queue/detail UI, finalization and cancellation forms.
- Produces: invoice/admin order display of method, collection time, accepting admin, and optional check/reference number.

- [ ] **Step 1: Write failing admin browser tests**

Assert queue counts and details, confirmation copy, required method match, optional trimmed check reference, cancellation reason, finalization refresh, one paid invoice, audit fields, and customer inability to access the route.

- [ ] **Step 2: Run browser tests and verify RED**

Run with `PLAYWRIGHT_MODULE` set: `node supabase-app/tests/offline-payment-admin-browser.cjs` and `node supabase-app/tests/invoice-desk-browser.cjs`.

Expected: FAIL because the route and controls are missing.

- [ ] **Step 3: Implement the admin queue**

Add **Delivery payments** to the Sales & delivery navigation. Render awaiting requests with shop, delivery address, method, items, total, request time, job/PO/notes, and actions. Require an explicit final confirmation before calling the admin API and refresh the workspace after success.

- [ ] **Step 4: Add invoice audit display and run browser tests**

Show the cash/check method, collection timestamp, accepting administrator, and optional reference on the order invoice and invoice desk. Add responsive styling and run the commands from Step 2.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase-app/converter-express_1.html supabase-app/auth.js supabase-app/crm.css supabase-app/tests/offline-payment-admin-browser.cjs supabase-app/tests/invoice-desk-browser.cjs
git commit -m "feat: manage delivery payments in admin"
```

### Task 6: Full Verification and Deployment

**Files:**
- Modify: `supabase-app/README.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: all tasks above.
- Produces: deployed migration, `crm-api`, static site, and documented operations.

- [ ] **Step 1: Run all unit tests**

Run every `supabase-app/tests/*.test.mjs` with Node's test runner.

Expected: PASS.

- [ ] **Step 2: Run all browser tests**

Run every `supabase-app/tests/*.cjs` with the configured Playwright module and Chrome.

Expected: PASS with no page errors.

- [ ] **Step 3: Run static build and inspect output**

Run: `node tests/static-build.cjs` and inspect the generated deployment artifact for the three payment choices and no secret values.

Expected: PASS.

- [ ] **Step 4: Update operating documentation**

Document how staff record cash/check collection, cancel a request, release inventory, and identify the accepting administrator in audit history.

- [ ] **Step 5: Deploy backend in dependency order**

Push migration `202610110001_offline_delivery_payments.sql`, deploy `crm-api`, verify migration parity, and verify the deployed function version before publishing the frontend.

- [ ] **Step 6: Run live smoke tests and clean up**

Create one cash request and one check request with temporary stock. Finalize one and cancel the other. Verify one paid order/invoice, no duplicate order on retry, released cancelled inventory, emails, audit fields, and restored product counts; then remove temporary records.

- [ ] **Step 7: Commit and push**

```bash
git add README.md supabase-app/README.md
git commit -m "docs: document delivery payment operations"
git push origin main
```
