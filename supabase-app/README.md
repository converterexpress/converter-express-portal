Latest release audit: [October 6, 2026 findings and remaining launch requirements](../docs/RELEASE-AUDIT-2026-10-06.md).

**Admin sign-in update:** At the owner’s request, admin access now uses verified email/password and the server-maintained staff list. Authenticator enrollment is no longer required; earlier MFA release-check references below are superseded.

# Converter Express — Supabase staging build

**Connected backend as of October 6, 2026.** Project `hjxhaxlthpqqktregwvu` has the private schema, clean 1,308-part catalog and `crm-api` Edge Function deployed. The original local preview on port 8766 is unchanged. Public bootstrap, unauthenticated command rejection, direct workspace RPC denial and origin restrictions have been verified on the hosted backend. Owner registration/MFA, customer email delivery and the remaining hosted acceptance checks below are still pending.

## What is included

- Existing homepage, catalog, customer pages, and CRM design.
- Supabase email/password registration and sign-in, email-verification flow, recovery request/password form, global sign-out, and admin TOTP enrollment/verification.
- Service-only business storage: private tables have RLS enabled and no browser grants. Only the authenticated Edge Function may invoke privileged persistence functions. Customers receive field-allowlisted projections and explicit commands, not writable workspace snapshots.
- Server-calculated order prices, discounts, tax, unpaid status, stock checks, reservations, idempotency keys, and revision retries.
- Private license uploads bound to the authenticated user; short-lived admin download links; size/signature checks.
- Fixed-host fitment proxy, private audit log, shared authenticated and anonymous request budgets, and revision conflict checks.

## Connect a project

1. Create a Supabase project in an appropriate US region under the business owner's account. Keep the database password private. Require MFA on the Supabase owner account.
2. Share only its Project URL and `sb_publishable_...` key. These belong in `config.js`. Never use `sb_secret_...`, a service-role key, database password, or personal access token in a browser file.
3. Authorize Supabase CLI access locally (`supabase login`) or use the project dashboard to apply the migration. No secret needs to be pasted into chat. Confirm the exact project before running remote commands.
4. Apply `supabase/migrations/202610050001_private_workspace.sql` with the project's SQL editor or `supabase db push` from this folder after linking the intended project.
5. Import the clean catalog from the existing local SQLite database using `scripts/prepare_import.py`. It validates data, refuses imports with unmapped account identities, writes a private SQL file outside this web folder, and never overwrites an existing target workspace. Review counts before running the generated SQL through the trusted SQL editor.
6. Deploy `crm-api` with the Supabase CLI. Set `APP_ORIGINS` in Edge Function secrets to the exact HTTPS frontend origin (and `http://127.0.0.1:8772` only while testing locally). Built-in server-side Supabase credentials are read only by the function. `verify_jwt=false` allows the public catalog/fitment route; all private actions explicitly verify Auth.getUser, getClaims, and a live auth.sessions record. Do not remove those checks.
7. Configure Auth: email verification required; minimum password length 10; site URL and exact redirect URL allowlist; custom transactional SMTP; appropriate Auth rate limits and CAPTCHA; enable TOTP MFA. Test email delivery before inviting customers. Do not add wildcard redirect URLs.
8. Create and verify the owner's Auth user, then grant staff access once through the SQL editor with their exact UUID:
   ```sql
   insert into ce_private.staff(user_id) values ('OWNER_AUTH_USER_UUID');
   ```
   No application page can grant this role. On first admin sign-in, the owner must enroll an authenticator. Define and verify an owner-assisted MFA recovery procedure before public launch; this build does not claim to provide recovery codes.
9. Run hosted acceptance checks below before opening public access. Choose frontend hosting separately; upload only the explicit web asset allowlist, never this entire development directory.

## Frontend deploy allowlist

`converter-express_1.html`, `crm.js`, `crm.css`, `auth.js`, `config.js`, `hero-v2.png`, `vendor/supabase-2.117.2.js`.

No Python backend is needed for this hosted build. Do not deploy `fitment_server.py`, original backup HTML files, SQL imports, migrations, tests, or private documents as public assets. Use HTTPS and configure security headers on the chosen frontend host.

## Local verification

- Business authorization/calculation tests: `node --test tests/security.test.mjs`.
- PostgreSQL migration/grants/revision tests: `node tests/database.mjs`. Install `@electric-sql/pglite@0.5.8` as a test dependency; the test uses its PostgreSQL engine and explicit mocks of Supabase auth/storage schemas. Hosted policies still require verification against Supabase.
- Start staging: `python3 scripts/preview.py`; open `http://127.0.0.1:8772/converter-express_1.html`.
- Disconnected browser checks: `node tests/browser.cjs`.
- Mocked connected UI checks: `node tests/connected-browser.cjs`. These replace Auth/API responses deliberately and do **not** prove live login, SMTP, MFA, or RLS configuration.

Use Node 22 or newer and install Playwright with Chrome available. `PLAYWRIGHT_MODULE` and `PGLITE_MODULE` can override test dependency locations. Supabase JS 2.117.2 is pinned and vendored; see vendor/README.md for its source/checksum.

## Required before launch

- Deploy and exercise Auth, verified registration, pending/approved/rejected access, TOTP and recovery, sign-out/revocation, and real password-reset email delivery.
- Test the Edge Function with two independent customer users, an MFA admin, anonymous requests, forged/expired tokens, and other-shop identifiers. Test direct REST/RPC/storage bypass attempts separately from UI tests.
- Verify API syntax/runtime and Supabase auth.sessions schema against the deployed project; local pure-module tests do not execute Deno or validate hosted gateway behavior.
- Re-run all existing CRM/fitment/catalog suites against genuine authenticated sessions. The original nine preview suites remain a reference, not evidence that this migration has passed them.
- Verify private document downloads, content validation, upload quotas/abuse controls, and a document malware scanning policy.
- Test simultaneous purchases, first-order eligibility, idempotency, price changes between quote and submit, staff/customer save conflicts, and server-side input validation across all admin CRM fields.
- Set session-lifetime policy, production Auth throttles, monitoring, backup/restore and retention; test restore. Database backups alone do not preserve Storage file bytes.
- Warranty photos currently remain inside the private workspace, with a 9 MB cumulative workspace cap to prevent blocking admin saves. Move these photos into private object storage before larger-scale use.
- Complete an XSS/CSP review of the inherited inline-handler frontend and dependency/security review. Supabase browser sessions use provider-managed browser token storage; the Django plan's HttpOnly-session design no longer applies. Do not claim HttpOnly cookie protection for this build.
- Provision frontend hosting and a domain. Public release remains blocked until the above checks pass and the owner can securely administer and recover the account.

## Current architecture limits

The existing CRM is preserved using one private, revisioned JSON workspace. API authorization is enforced in the Edge Function, not by exposing that row to customers with RLS. Global compare-and-swap serializes writes and prevents lost updates; a larger deployment should migrate high-volume records into normalized tables/transactions. This design is not a claim of unlimited scale or a completed external security audit.
