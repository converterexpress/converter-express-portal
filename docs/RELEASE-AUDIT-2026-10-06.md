# Converter Express release audit — October 6, 2026

## Decision

**Not ready to accept customer orders yet.** Core workflows passed the checks below, but all 1,308 catalog parts still have prices pending and no stock counts are entered. Customer email delivery is not verified. This audit is not a claim that every possible input or security risk has been eliminated.

## Fixes completed

- Added the missing read-only vehicle lookup route to the Supabase staging preview. Reproduced HTTP 404 before the fix; verified HTTP 200 and 2025 options afterward. Public files remain allowlisted.
- Added the exact Vercel team production origin (`https://converter-express-portal-converterexpress1-9251.vercel.app`) to the deployed backend's allowed origins. That address is configured in Auth redirects, but previously returned HTTP 403. Unrelated origins remain rejected.
- Updated obsolete browser tests that still expected mandatory authenticator enrollment and an unconfigured app. Tests now explicitly mock disconnected configuration, rather than depending on production settings being blank.
- Added an isolated Supabase-adapter admin browser workflow and an opt-in hosted customer acceptance test with cleanup.

## Evidence

| Layer | Result and scope |
| --- | --- |
| Existing local workflow suites | 9/9 passed against isolated temporary databases: clean start, cart, 21 regressions, server checks, CRM workflow, customer journeys, fitment, series edits, catalog creation. These do not prove hosted Auth by themselves. |
| Business authorization/calculation tests | 17/17 passed: projection privacy, staff membership, pending restrictions, totals, negotiated pricing, first order discount, quantities, duplicate retries, reservations, ownership, validation and attachment limits. |
| PostgreSQL engine tests | Passed migration, browser-role read/RPC denial, revision conflicts, audit writes, rate limits and private bucket checks using PGlite and mocked Auth/Storage schemas. |
| Supabase adapter customer browser | Passed sign-in, cart reload, server quote, first-order discount, unpaid checkout, cost filtering, sign-out clearing and recovery routing with explicit Auth/API mocks. |
| Supabase adapter admin browser | Passed activity, terms, negotiated prices, partial purchase receipts, quote follow-up and conversion, stock reservations, dispatch, delivery, reload persistence, active navigation and layouts at 1440/390/320px. API persistence used an isolated in-memory workspace and the actual server validation rules. |
| Hosted customer APIs | Passed real temporary Auth users, private license uploads, pending restrictions, forged metadata rejection, direct RPC denial, cross-user document/order isolation, concurrent final-unit purchase (one success, one stock rejection), duplicate retry without a second order, saved parts, profile, job reference, warranty request and rejection of a signed-out token. |
| Hosted admin | Verified password sign-in, 48 admin route/viewport combinations without JavaScript errors or horizontal overflow, unchanged-data save through the real admin API, and stale-revision rejection. |
| Public UI | Smoke-checked homepage, catalog, fitment, about, contact, returns, terms, privacy, registration and login at phone width. |
| Cleanup | Removed both runs' temporary Auth users, workspace shop accounts, products, orders, inventory and license uploads. Rechecked zero audit users; original catalog count remains 1,308. Audit history intentionally retains test-operation events. |

One hosted ordering run timed out after 35 seconds. The repeat passed; observed successful requests took approximately 0.2–3.3 seconds. Treat this as an intermittent latency finding, not proof that a timeout defect was fixed. The frontend retains a 30-second request timeout and order idempotency for safe retry.

## Before customer handoff

1. Enter real series prices and physical inventory counts. Add cost data if profit reports will be used. The current unavailable-order behavior is deliberate; no prices or stock were fabricated for testing.
2. Verify actual confirmation and password-reset email receipt and completion. Permission for one owner test email was requested; no email was sent as part of this audit. Review production SMTP configuration and delivery limits before customer registration.
3. Verify business contact details and published return/warranty terms. No contractual, shipping cutoff or tax policy was invented during testing.
4. Payments and notifications are not integrated. Orders remain unpaid until recorded by staff; purchase orders must be sent to suppliers separately. Do not promise automatic payment collection, order emails or dispatch texts.
5. Complete backup/restore testing and document-upload operational review before storing important customer documents. This run checked file access isolation, not malware detection or disaster recovery.

Admin access is password-only with a 10-character minimum, as explicitly requested by the owner. Server-side staff membership, verified identity and live-session checks remain enforced.

## Repeatable checks

Start the isolated staging server with `CONVERTER_PREVIEW_PORT=8778 python3 supabase-app/scripts/preview.py`.

- `node --test supabase-app/tests/security.test.mjs`
- `node supabase-app/tests/database.mjs` (set `PGLITE_MODULE` if needed)
- `node supabase-app/tests/browser.cjs`
- `node supabase-app/tests/connected-browser.cjs`
- `node supabase-app/tests/release/admin-browser.cjs`
- `CONVERTER_RUN_HOSTED_AUDIT=1 python3 supabase-app/tests/release/hosted.py`

Browser tests need Playwright and Chrome (`PLAYWRIGHT_MODULE` may locate Playwright). The hosted test requires the authenticated Supabase CLI and deliberately creates temporary records in the specified project. Review the target before opting in; it reads credentials into memory and does not print or store keys or passwords.
