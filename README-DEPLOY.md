# Converter Express Portal — Deploy & Connect Your Domain

This is the standalone version of the Converter Express B2B order portal: real database (SQLite), approval-gated logins, inventory control, and pay-in-person ordering. It comes pre-seeded with all 1,155 part numbers (CARB EOs D-724-4, -5, -7, -8 plus 5954, 5955, 201492, 201449).

Getting it on your own domain is three stages: **put the code on GitHub → deploy it on Railway → point your domain at Railway.** No coding needed — every step is clicks.

---

## Stage 1 — Put the code on GitHub (free, ~5 min)

1. Create a free account at **github.com** (or log in).
2. Click **New repository** → name it `converter-express-portal` → set it to **Private** → Create.
3. On the empty repo page, click **"uploading an existing file."**
4. Drag in ALL the files from this folder (`package.json`, `server.js`, `db.js`, `seed-parts.json`, `.gitignore`, `README-DEPLOY.md`, and the `public` folder's three files — GitHub's drag-and-drop keeps the folder structure if you drag the whole folder contents).
   - If the `public` folder doesn't upload as a folder: create the files manually via **Add file → Create new file** and type `public/index.html` as the filename (the `/` creates the folder), pasting in the contents. Repeat for `public/app.js` and `public/styles.css`.
5. Click **Commit changes**.

## Stage 2 — Deploy on Railway (~$5/month, ~10 min)

Railway is the easiest host for this app because it gives the database a permanent disk.

1. Go to **railway.app** → sign up **with your GitHub account**.
2. **New Project → Deploy from GitHub repo** → pick `converter-express-portal`. Railway auto-detects Node and builds it.
3. **Add a volume** (this is what makes your data permanent):
   - Right-click the service (or open its settings) → **Attach Volume** → set **Mount Path** to `/data`.
4. **Set one environment variable** on the service: Variables → add `DATA_DIR` = `/data`. Redeploy if prompted.
5. Open the service's **Settings → Networking** → click **Generate Domain**. You'll get a link like `converter-express-portal-production.up.railway.app`.
6. **Open that link and immediately create your owner login** (the first-run setup screen). Do this before sharing the link with anyone.

> Skipping the volume/DATA_DIR steps means accounts and orders would reset on every redeploy. With them, everything persists.

## Stage 3 — Connect your domain (~10 min + DNS wait)

Use a **subdomain** like `order.yourdomain.com` or `portal.yourdomain.com` — it's the cleanest setup and works at every registrar.

1. In Railway: service → **Settings → Networking → Custom Domain** → type `order.yourdomain.com`. Railway shows you a **CNAME target** (something like `xxxx.up.railway.app`).
2. At your domain registrar (GoDaddy, Namecheap, Google/Squarespace Domains, Cloudflare — wherever you bought the domain), open **DNS settings** and add:
   - **Type:** CNAME
   - **Host / Name:** `order` (just the subdomain part)
   - **Value / Points to:** the CNAME target Railway gave you
3. Wait for DNS to update — usually 5–30 minutes, occasionally a few hours. Railway issues the HTTPS certificate automatically once it sees the record.
4. Done: `https://order.yourdomain.com` is your live portal.

**Want the bare domain** (`yourdomain.com` with no subdomain)? That needs an ALIAS/ANAME record or a registrar that supports CNAME flattening (Cloudflare does). Easiest pattern: put the portal on `order.yourdomain.com` and let the bare domain host your marketing page.

---

## Running it on your own computer first (optional)

```
npm install
npm start
```

Then open http://localhost:3000. Data saves to a local `data/` folder.

Requires Node 22.5 or newer (`node -v` to check). The database uses Node's built-in SQLite, so there are no native modules to compile — the only dependencies are three small, pure-JavaScript packages.

## Day-to-day

- **Approve shops:** Customers tab → Pending approval → Approve. Nobody logs in until you approve them.
- **Stock:** Inventory tab → tap IN STOCK / OUT per part, or filter and use the bulk buttons. All EO parts start OUT; 5954, 5955, 201492, 201449 start IN STOCK.
- **Orders:** come in as NEW (badge on the tab) → Confirm → Delivered/paid. All orders are pay-in-person; the portal never touches money.
- **Backup:** while logged in as owner, visit `/api/export` and save the page — it's a full JSON dump of accounts, parts, and orders.

## Notes

- The Claude artifact version and this site don't share data — this starts fresh (same 1,155-part seed).
- 5954 and 5955 don't appear in the four EO PDFs you provided — verify them against Converter Unlimited's current EO appendix before selling in California.
- Want additions (text/email alerts on new orders, prices on parts, password resets, a CSV part importer)? They bolt on easily — ask Claude.
