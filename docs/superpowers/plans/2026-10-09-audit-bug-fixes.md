# Audit Bug Fixes and Payment-First Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all seven confirmed audit bugs and make verified Whop payment a prerequisite for confirming customer online orders.

**Architecture:** Add private relational checkout-reservation and payment-event records beside the existing revisioned workspace, then finalize paid customer orders through an atomic database RPC after verified Whop payment. Keep legacy invoice payments and admin-created orders compatible, while adding server-owned refund/cancellation review commands, quote email delivery history, and truthful production/legal output.

**Tech Stack:** Static HTML/CSS/JavaScript, Supabase Auth/Postgres/Storage/Edge Functions, Deno TypeScript, Node test runner, Playwright/Chrome, Resend, Whop API/webhooks.

**Spec:** `docs/superpowers/specs/2026-10-09-audit-bug-fixes-design.md`

## Global Constraints

- Customer online orders are confirmed only after a server-verified successful Whop payment.
- Admin-created phone/walk-in orders continue to support offline methods and account terms.
- Full and partial refunds require administrator review; no automatic cancellation refund.
- Ambiguous provider outcomes enter review and never fabricate a paid/refunded/final state.
- Existing orders and legacy unpaid invoice checkout remain readable and usable.
- The browser never owns authoritative money, merchant, refundable balance, payment identity, or confirmation state.
- Use integer cents, stable idempotency keys, server authorization, and atomic stock/order transitions.
- Do not expose secrets, full provider payloads, license contents, or customer data in logs.
- Do not claim attorney review of public legal copy.
- Write a failing regression test and observe the expected failure before each production change.

## Review Focus

- A verified payment arrives after its reservation expires: retain payment for review, create no duplicate charge, and do not silently discard it; pinned in Task 4.
- Two checkouts compete for the last unit: only stock-covered reservations succeed and only one final order can consume the unit; pinned in Tasks 2 and 4.
- A refund request times out after Whop may have accepted it: preserve the idempotency key and enter review instead of retrying as a new refund; pinned in Task 5.
- A user refreshes or double-clicks during payment: reuse the reservation and produce at most one order; pinned in Tasks 3, 4, and 8.
- A legacy unpaid invoice and a new payment-first checkout coexist: both use their own verified flow without corrupting the other; pinned in Tasks 4, 5, and 8.

---

### Task 1: Payment Lifecycle Database Foundation

**Files:**
- Create: `supabase-app/supabase/migrations/202610090001_payment_lifecycle.sql`
- Create: `supabase-app/tests/payment-lifecycle-database.mjs`
- Modify: `supabase-app/README.md`

**Interfaces:**
- Produces: private tables `ce_private.checkout_reservations`, `ce_private.payment_events`; service-role-only RPCs `ce_checkout_read`, `ce_checkout_reserve`, `ce_checkout_transition`, `ce_checkout_expire`, and `ce_paid_order_finalize`.
- Consumes: existing `ce_private.workspace`, `ce_workspace_read`, revision/audit pattern, and Supabase service-role boundary.

- [ ] **Step 1: Write the failing database test**

Add tests named `reservation tables deny anon and authenticated roles`, `reservation is idempotent and rejects changed request hash`, `active reservations consume stock once`, `expired reservations release stock`, and `paid finalization creates one order and one event` with synthetic users/products and no provider call.

- [ ] **Step 2: Run the database test and verify RED**

Run: `node supabase-app/tests/payment-lifecycle-database.mjs` in the configured disposable Supabase/Postgres test environment.  
Expected: FAIL because the tables and RPCs do not exist.

- [ ] **Step 3: Implement the migration**

Create the two private tables, constraints/indexes, `updated_at` handling, expiration query, event uniqueness, row locking, service-role-only grants, and atomic finalization RPC. `ce_paid_order_finalize(reservation_id uuid, payment jsonb, expected_revision bigint)` returns the confirmed order ID and must be idempotent.

- [ ] **Step 4: Run the database test and verify GREEN**

Run the command from Step 2.  
Expected: PASS with no public table/RPC access.

- [ ] **Step 5: Document migration/deployment order and commit**

Update the README with migration-first rollout and rollback constraints, then commit the migration, test, and documentation.

---

### Task 2: Pure Reservation, Availability, and Finalization Rules

**Files:**
- Create: `supabase-app/supabase/functions/_shared/checkout.mjs`
- Create: `supabase-app/tests/checkout-first.test.mjs`
- Modify: `supabase-app/supabase/functions/_shared/business.mjs`

**Interfaces:**
- Produces: `checkoutRequestHash(input): Promise<string>`, `buildCheckoutReservation(data, user, args, activeReservations, now)`, `reservationAvailability(data, activeReservations, partNumber, now)`, and `buildPaidOrder(data, reservation, verifiedPayment)`.
- Consumes: existing server quote/order validation and pricing rules in `business.mjs`.

- [ ] **Step 1: Write failing pure-rule tests**

Test server-owned totals, user/shop binding, stable request hashing, changed-payload rejection, expiration, duplicate lines, active reservation stock, two users competing for one unit, first-order discount reservation, safe integer cents, and one deterministic paid-order snapshot.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test supabase-app/tests/checkout-first.test.mjs`  
Expected: FAIL because `checkout.mjs` and its exports do not exist.

- [ ] **Step 3: Implement the pure functions**

Reuse existing validation and pricing behavior; return serializable reservation/order objects without database or network access. Ensure active unexpired reservations reduce availability exactly once.

- [ ] **Step 4: Run checkout and existing security tests**

Run: `node --test supabase-app/tests/checkout-first.test.mjs supabase-app/tests/security.test.mjs supabase-app/tests/stock-first-fitment.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Commit**

Commit the new shared module, tests, and minimal `business.mjs` changes.

---

### Task 3: Server Payment-First Checkout Endpoints

**Files:**
- Modify: `supabase-app/supabase/functions/crm-api/index.ts`
- Modify: `supabase-app/supabase/functions/_shared/whop.mjs`
- Create: `supabase-app/tests/payment-first-api.test.mjs`

**Interfaces:**
- Produces Edge actions `checkout-reserve`, `checkout-session`, and `checkout-status` returning limited reservation projections; extends the Whop adapter with payment creation/retrieval validation for reservations.
- Consumes Task 1 RPCs and Task 2 pure checkout functions.

- [ ] **Step 1: Write failing API-boundary tests**

Pin authentication, approved-account requirement, exact accepted fields, idempotent refresh/double-click, changed payload rejection, server amount, expiry, safe restart, processing/review lockout, and coexistence with legacy `payment-session` invoice behavior.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test supabase-app/tests/payment-first-api.test.mjs`  
Expected: FAIL because the actions are unsupported.

- [ ] **Step 3: Implement the three Edge actions and Whop adapter changes**

Use the authenticated user and service-role RPCs, return no other shop data, reuse stable reservations, and never issue a new payment while status is `PROCESSING`, `PAID`, or `REVIEW`.

- [ ] **Step 4: Run focused payment/security tests**

Run: `node --test supabase-app/tests/payment-first-api.test.mjs supabase-app/tests/whop.test.mjs supabase-app/tests/security.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Commit**

Commit the Edge/API and adapter changes with tests.

---

### Task 4: Verified Webhook Order Finalization

**Files:**
- Modify: `supabase-app/supabase/functions/whop-webhook/index.ts`
- Modify: `supabase-app/supabase/functions/_shared/whop.mjs`
- Create: `supabase-app/tests/payment-finalization.test.mjs`
- Modify: `supabase-app/tests/whop.test.mjs`

**Interfaces:**
- Produces: `verifyReservationPayment(payment, reservation, companyId)` and webhook behavior that calls `ce_paid_order_finalize` exactly once or moves the reservation to `REVIEW`.
- Consumes Task 1 finalization RPC and Task 3 reservation metadata/payment retrieval.

- [ ] **Step 1: Write failing finalization tests**

Test correct payment, duplicate event, duplicate webhook delivery, wrong merchant/currency/amount/reference/user, pending/refunded payment, expired reservation with payment, last-unit contention, workspace revision retry, and verified-payment finalization failure entering review.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test supabase-app/tests/payment-finalization.test.mjs supabase-app/tests/whop.test.mjs`  
Expected: FAIL because reservation finalization is absent.

- [ ] **Step 3: Implement webhook routing and verification**

Route reservation-backed payments to atomic finalization; preserve the legacy invoice-payment path. Deduplicate by provider event/payment ID. Never return a retryable response that can create a second business result after a committed finalization.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command.  
Expected: PASS.

- [ ] **Step 5: Commit**

Commit webhook and verification changes.

---

### Task 5: Admin Cancellation and Full/Partial Refunds

**Files:**
- Create: `supabase-app/supabase/functions/_shared/refunds.mjs`
- Create: `supabase-app/tests/refunds.test.mjs`
- Modify: `supabase-app/supabase/functions/_shared/business.mjs`
- Modify: `supabase-app/supabase/functions/_shared/whop.mjs`
- Modify: `supabase-app/supabase/functions/crm-api/index.ts`

**Interfaces:**
- Produces: `refundSummary(order)`, `buildRefundRequest(order, amountCents, reason, actor)`, `applyVerifiedRefund(data, orderId, refund)`, Edge actions `cancellation-preview`, `cancel-unpaid-order`, `refund-order`, `refund-status`, and `cancel-without-refund`.
- Consumes verified receipt history and Whop merchant/refund API adapter.

- [ ] **Step 1: Write failing refund and cancellation tests**

Cover staff-only access, unpaid cancellation, full refund, partial refund, cumulative refund ceiling, zero/negative/unsafe amounts, stable idempotency, provider rejection, timeout-after-acceptance entering review, retained amount, required reasons, cancellation without refund second-confirmation token, active fulfillment warnings, and reinstatement blocked after a confirmed refund.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test supabase-app/tests/refunds.test.mjs supabase-app/tests/customer-updates.test.mjs supabase-app/tests/whop.test.mjs`  
Expected: FAIL because refund interfaces/actions do not exist.

- [ ] **Step 3: Implement pure refund rules and Whop adapter**

Calculate refundable cents exclusively from verified collections minus confirmed refunds. Preserve immutable attempts and reuse an attempt's idempotency key after ambiguous responses.

- [ ] **Step 4: Implement authenticated Edge commands**

Require staff authorization, validate exact request shapes, retrieve canonical Whop refund state, commit only verified results, and write audit activity.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the Step 2 command.  
Expected: PASS.

- [ ] **Step 6: Commit**

Commit refund/cancellation server behavior and tests.

---

### Task 6: Quote Email Delivery With Manual Acceptance

**Files:**
- Create: `supabase-app/supabase/functions/_shared/quote-email.mjs`
- Create: `supabase-app/tests/quote-email.test.mjs`
- Modify: `supabase-app/supabase/functions/crm-api/index.ts`
- Modify: `supabase-app/crm.js`
- Create: `supabase-app/tests/quote-email-browser.cjs`

**Interfaces:**
- Produces: `quoteEmail(quote, account)`, Edge action `quote-email` with `preview|send|status`, and admin UI actions for email and manually recorded acceptance/decline.
- Consumes the existing order-email Resend delivery-state/idempotency pattern.

- [ ] **Step 1: Write failing quote-email unit tests**

Assert escaped content, server-selected recipient, quote snapshot, provider accepted/rejected/unknown states, no duplicate accepted send, retry rules, and no claim of inbox delivery.

- [ ] **Step 2: Run unit test and verify RED**

Run: `node --test supabase-app/tests/quote-email.test.mjs`  
Expected: FAIL because the module/action does not exist.

- [ ] **Step 3: Implement email generation and Edge action**

Follow `order-email.mjs`; bind delivery records to quote ID and snapshot, and keep acceptance status outside delivery state.

- [ ] **Step 4: Write the failing browser test**

Assert **Email quote**, preview/send/retry/status UI, provider-accepted wording, and explicit “Acceptance recorded by staff” behavior.

- [ ] **Step 5: Run browser test and verify RED**

Run with `PLAYWRIGHT_MODULE` set: `node supabase-app/tests/quote-email-browser.cjs`  
Expected: FAIL because the UI still uses the offline Sent selector.

- [ ] **Step 6: Implement the quote UI and verify GREEN**

Run unit and browser tests from Steps 2 and 5.  
Expected: PASS.

- [ ] **Step 7: Commit**

Commit quote email backend/UI/tests.

---

### Task 7: Accurate Legal Pages, Production Build, and CSV

**Files:**
- Modify: `supabase-app/converter-express_1.html`
- Modify: `supabase-app/auth.js`
- Modify: `supabase-app/scripts/build-static.cjs`
- Create: `supabase-app/tests/production-copy.test.mjs`
- Create: `supabase-app/tests/legal-browser.cjs`
- Create: `supabase-app/tests/orders-csv.test.mjs`
- Modify: `supabase-app/README.md`

**Interfaces:**
- Produces truthful Terms/Privacy content, preview-free production assets, and `ordersToCsv()` rows containing saved payment/refund state.
- Consumes existing static build and order/refund fields from Task 5.

- [ ] **Step 1: Write failing legal/build tests**

Assert Whop is named, customer payment-before-confirmation is explained, admin-reviewed refund language is present, effective date/contact exist, and output excludes draft warnings, Stripe payment claims, “online payments are not connected,” preview sign-in functions, and “saved on this computer.”

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test supabase-app/tests/production-copy.test.mjs` and the legal browser test.  
Expected: FAIL on current production strings.

- [ ] **Step 3: Replace legal copy and isolate/remove preview implementation**

Keep test fixtures under tests, preserve hosted fail-closed behavior, and add an internal README legal-review launch item without customer-facing draft language.

- [ ] **Step 4: Write failing CSV tests**

Assert Cash, Check, Bank transfer, Whop, unpaid blank, partial status, confirmed refund amount/status, cancelled state, and formula-injection escaping.

- [ ] **Step 5: Run CSV test and verify RED**

Run: `node --test supabase-app/tests/orders-csv.test.mjs`  
Expected: FAIL because Payment Method is hard-coded to `Card` and refund columns are absent.

- [ ] **Step 6: Fix CSV export and verify focused tests**

Run the legal/build/CSV tests.  
Expected: PASS.

- [ ] **Step 7: Commit**

Commit legal, production build, export, documentation, and tests.

---

### Task 8: Customer Payment-First Checkout UI

**Files:**
- Modify: `supabase-app/converter-express_1.html`
- Modify: `supabase-app/auth.js`
- Modify: `supabase-app/tests/connected-browser.cjs`
- Modify: `supabase-app/tests/whop-elements-browser.cjs`
- Create: `supabase-app/tests/payment-first-browser.cjs`

**Interfaces:**
- Produces browser states `REVIEW`, `PAYMENT_REQUIRED`, `PAYMENT_PROCESSING`, `CONFIRMED`, `FAILED`, `EXPIRED`, `REVIEW_REQUIRED` and reservation resume/poll behavior.
- Consumes Task 3 checkout actions and Task 4 confirmed order projection.

- [ ] **Step 1: Write failing customer browser tests**

Assert no order/invoice number before payment, disabled duplicate submission, refresh resumes the reservation, failure creates no order, expiration requotes, processing cannot repay, confirmed payment navigates once, review tells the customer not to pay again, and legacy unpaid invoices still render their payment control.

- [ ] **Step 2: Run the browser test and verify RED**

Run with `PLAYWRIGHT_MODULE` set: `node supabase-app/tests/payment-first-browser.cjs`  
Expected: FAIL because checkout currently creates an unpaid order before payment.

- [ ] **Step 3: Implement reservation-based checkout UI**

Replace the customer order command with reserve/session/status calls. Keep admin order creation unchanged. Persist only a non-secret reservation ID/idempotency key needed for refresh recovery.

- [ ] **Step 4: Run focused connected/payment browser tests**

Run: `connected-browser.cjs`, `whop-elements-browser.cjs`, and `payment-first-browser.cjs`.  
Expected: PASS.

- [ ] **Step 5: Commit**

Commit checkout UI and browser tests.

---

### Task 9: Admin Cancellation, Refund, and Payment Review UI

**Files:**
- Modify: `supabase-app/converter-express_1.html`
- Modify: `supabase-app/auth.js`
- Modify: `supabase-app/crm.js`
- Create: `supabase-app/tests/refund-browser.cjs`
- Modify: `supabase-app/tests/invoice-desk-browser.cjs`

**Interfaces:**
- Produces cancellation review panel, full/partial/no-refund actions, financial preview, immutable history display, and payment reservation review controls.
- Consumes Task 5 cancellation/refund actions and Task 3 reservation status.

- [ ] **Step 1: Write failing admin browser tests**

Test unpaid cancellation, full refund, partial amount validation, cumulative refundable balance, retained amount, mandatory reason, second confirmation for no refund, provider rejection, ambiguous review, blocked reinstatement after refund, and safe clear/restart controls only for failed/expired reservations.

- [ ] **Step 2: Run browser tests and verify RED**

Run with `PLAYWRIGHT_MODULE` set: `node supabase-app/tests/refund-browser.cjs`  
Expected: FAIL because cancellation is currently a direct boolean mutation.

- [ ] **Step 3: Implement admin financial workflow UI**

Remove direct paid cancellation, display server previews and results, disable controls during requests, and show original collected/refunded/retained totals on order and invoice.

- [ ] **Step 4: Run refund and invoice browser tests**

Run `refund-browser.cjs` and `invoice-desk-browser.cjs`.  
Expected: PASS.

- [ ] **Step 5: Commit**

Commit admin UI and browser tests.

---

### Task 10: Full Verification, Audit Update, and Deployment Runbook

**Files:**
- Modify: `docs/SHOP_OWNER_AUDIT.md`
- Modify: `supabase-app/README.md`
- Create: `docs/PAYMENT_RELEASE_RUNBOOK.md`

**Interfaces:**
- Produces a reviewable release record, remaining external verification blockers, and exact migration/server/frontend rollout and rollback procedure.
- Consumes all previous tasks.

- [ ] **Step 1: Run all unit tests**

Run every `supabase-app/tests/*.test.mjs`.  
Expected: all pass with zero failures.

- [ ] **Step 2: Run all browser tests**

Run every `supabase-app/tests/*.cjs` using bundled Playwright/Chrome.  
Expected: all pass with zero page errors or failures.

- [ ] **Step 3: Run database tests in the disposable environment**

Run existing database scripts plus `payment-lifecycle-database.mjs`.  
Expected: all authorization, private storage, audit, reservation, and finalization checks pass.

- [ ] **Step 4: Build and inspect production output**

Run `node supabase-app/scripts/build-static.cjs`, scan `dist` for forbidden preview/legal strings and secrets, serve it locally, and navigate public/customer/admin routes at desktop and mobile widths.  
Expected: no forbidden strings, missing assets, console errors, or overflow.

- [ ] **Step 5: Perform authorized integration verification**

Use only disposable accounts and an authorized Resend recipient. Use a Whop test capability or an explicitly authorized smallest internal transaction; if unavailable, record payment settlement/refund as unverified rather than charging anyone.

- [ ] **Step 6: Update audit and release documentation**

Mark fixed bugs with commit/test evidence, preserve unresolved missing features, document legal-review and provider-live-test limitations, and write deployment/monitoring/rollback commands.

- [ ] **Step 7: Final review and commit**

Review the entire branch against the specification acceptance criteria, then commit documentation and any final test-only corrections.

