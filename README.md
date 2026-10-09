# Converter Express Portal

This repository contains the original Node portal and the latest redesigned application prepared for Supabase.

| Directory | Status | Start |
| --- | --- | --- |
| Root / `public/` | Original Node/SQLite portal; retained without changing its startup | `npm install && npm start` |
| `local-preview/` | Latest redesigned homepage, catalog, shop dashboard and operational CRM; local review only | `python3 local-preview/fitment_server.py` |
| `supabase-app/` | Latest design with prepared Supabase Auth, private storage, access controls and server-side ordering; **Backend connected; owner onboarding and remaining release checks pending** | `python3 supabase-app/scripts/preview.py` |

The local preview opens on port 8766. It deliberately has no production authentication; keep it on localhost. The Supabase staging preview opens on port 8772; production Auth redirects are restricted to the deployed HTTPS sites.

## Current migration status

The latest catalog contains 1,308 parts. Sample accounts, orders, seeded costs and assumed card processing fees have been removed from the local application. No business database, customer documents, credentials, or private import files are committed.

The Supabase build includes customer login, admin TOTP, scoped server responses, private business-license storage, server-calculated orders, stock checks, revision conflicts and retry protection. Local business-rule, PostgreSQL-engine and browser tests have passed; browser Auth tests use explicit mocks. Actual Supabase Auth, email, Edge Functions, Storage and the complete deployed CRM still require verification.

See [Supabase setup and release checks](supabase-app/README.md). Supply only a Supabase project URL and publishable key in `supabase-app/config.js`; never add server secrets to frontend files. Follow its deployment asset allowlist rather than publishing the repository directory.

## Vercel deployment

Vercel now serves the Supabase frontend as static files, rather than starting the original Express/SQLite server. Keep the Vercel Root Directory at the repository root. `vercel.json` selects the Other framework, runs `node scripts/build-static.cjs`, and publishes only `dist/`. The build uses an explicit public asset allowlist and supplies `index.html` for the homepage. Hash-based page routes use static files. The two read-only `/api/fitment/*` functions proxy vehicle options and application results from the existing lookup provider; they do not need Supabase or access the business database.

Run `node tests/static-build.cjs` and `node tests/fitment.cjs` to verify the deployment artifact and public lookup. Supabase project `hjxhaxlthpqqktregwvu` is configured with the private schema, clean catalog and deployed API. Owner onboarding, real email delivery, authenticated workflow verification and the remaining release checks are still required before accepting live orders.

`npm start` still runs the original portal locally. The older [deployment guide](README-DEPLOY.md) applies only to that Node portal, not Vercel.

## Primary domain (October 8, 2026)

The primary website address is `https://www.converterexpress.net/`. SEO canonicals, sitemap URLs, branded Auth email links and new order email links use this domain. The email sender remains `accounts@converterexpress.co`, which is the verified sending domain. Supabase allows the new origin while retaining existing origins for compatibility. Vercel redirects the bare `.net` domain to the primary `www.converterexpress.net` host.
