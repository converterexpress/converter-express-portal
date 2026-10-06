# Converter Express Portal

This repository contains the original Node portal and the latest redesigned application prepared for Supabase.

| Directory | Status | Start |
| --- | --- | --- |
| Root / `public/` | Original Node/SQLite portal; retained without changing its startup | `npm install && npm start` |
| `local-preview/` | Latest redesigned homepage, catalog, shop dashboard and operational CRM; local review only | `python3 local-preview/fitment_server.py` |
| `supabase-app/` | Latest design with prepared Supabase Auth, private storage, access controls and server-side ordering; **not connected or deployed** | `python3 supabase-app/scripts/preview.py` |

The local preview opens on port 8766. It deliberately has no production authentication; keep it on localhost. The Supabase staging preview opens on port 8772 and disables account access until public project settings are supplied.

## Current migration status

The latest catalog contains 1,308 parts. Sample accounts, orders, seeded costs and assumed card processing fees have been removed from the local application. No business database, customer documents, credentials, or private import files are committed.

The Supabase build includes customer login, admin TOTP, scoped server responses, private business-license storage, server-calculated orders, stock checks, revision conflicts and retry protection. Local business-rule, PostgreSQL-engine and browser tests have passed; browser Auth tests use explicit mocks. Actual Supabase Auth, email, Edge Functions, Storage and the complete deployed CRM still require verification.

See [Supabase setup and release checks](supabase-app/README.md). Supply only a Supabase project URL and publishable key in `supabase-app/config.js`; never add server secrets to frontend files. Follow its deployment asset allowlist rather than publishing the repository directory.

The original `npm start` deployment has not been switched to the new build. Do not switch a live site until the Supabase project is configured and the release checks pass. The older [deployment guide](README-DEPLOY.md) applies only to the original root Node portal.
