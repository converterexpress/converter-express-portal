# Whop Payment Element Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the invoice payment redirect with Whop's embedded Payment Element while keeping invoice totals, confirmation, and settlement authoritative on the server.

**Architecture:** The invoice page requests a short-lived, server-calculated payment configuration, mounts Whop PaymentElement plus the required BrandingElement, and sends only the resulting `ctok_` confirmation token back to the API. The API creates the Whop payment with an exact invoice-bound amount and metadata; the browser handles any next action, while the signed webhook remains the only path that marks an invoice paid.

**Tech Stack:** Vanilla JavaScript, Whop Elements CDN, Supabase Edge Functions, Node test runner, Playwright.

**Spec:** Approved chat design on 2026-10-09.

## Global Constraints

- Never expose `WHOP_COMPANY_API_KEY` or webhook secrets to the browser.
- Derive the payable amount and customer ownership from the stored invoice.
- Mount Whop's required BrandingElement with PaymentElement.
- Treat the signed Whop webhook as the source of truth for closing invoices.
- Keep online payments gated by `WHOP_PAYMENTS_ENABLED` and all required secrets.

## Review Focus

- A changed, paid, canceled, or unauthorized invoice must not create a payment.
- A forged amount, reference, or confirmation token must not be accepted.
- Duplicate submissions and webhook deliveries must not double-credit an invoice.
- 3D Secure, wallet cancellation, processing, and failed states need clear customer feedback.
- The embedded checkout must remain usable at 320px and fail safely if Whop's upcoming script is unavailable.

---

### Task 1: Server payment contract

**Files:**
- Modify: `supabase-app/supabase/functions/_shared/whop.mjs`
- Modify: `supabase-app/supabase/functions/crm-api/index.ts`
- Test: `supabase-app/tests/whop.test.mjs`

- [ ] Write failing tests for server-owned element configuration, `ctok_` validation, current Whop API version, and direct-payment webhook matching.
- [ ] Run the focused test and verify the new assertions fail.
- [ ] Add payment-session and payment-confirm contracts using the invoice reservation and idempotency reference.
- [ ] Run the focused test and the full unit suite.

### Task 2: Embedded invoice checkout

**Files:**
- Modify: `supabase-app/converter-express_1.html`
- Modify: `supabase-app/auth.js`
- Modify: `supabase-app/crm.css`
- Test: `supabase-app/tests/whop-elements-browser.cjs`

- [ ] Write a failing browser test for mounting PaymentElement and BrandingElement, disabled-to-ready pay state, confirmation, and mobile width.
- [ ] Run it and verify it fails because the embedded surface is absent.
- [ ] Mount the official Whop Elements CDN on demand and implement confirmation/next-action UI states.
- [ ] Run the browser test and existing browser checks.

### Task 3: Build, documentation, and release verification

**Files:**
- Modify: `docs/WHOP-SETUP.md`
- Generated: `dist/*`

- [ ] Document the embedded flow, payment-method-domain requirement, feature flag, secrets, and rollback behavior.
- [ ] Run the static build, all unit tests, relevant browser tests, and inspect the built output.
- [ ] Review the diff for credentials and generated-file consistency.
