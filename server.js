const express = require("express");
const crypto = require("crypto");
const path = require("path");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const db = require("./db");

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "200kb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

const PROD = !!process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === "production";
const COOKIE = "ce_session";
const cookieOpts = { httpOnly: true, sameSite: "lax", secure: PROD, maxAge: 1000 * 60 * 60 * 24 * 30 };

/* ---------- helpers ---------- */
const now = () => Date.now();
const publicUser = (u) => u && ({ id: u.id, username: u.username, business: u.business, contact: u.contact, phone: u.phone, role: u.role, status: u.status, created_at: u.created_at });

function currentUser(req) {
  const token = req.cookies[COOKIE];
  if (!token) return null;
  return db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`).get(token) || null;
}
function requireUser(req, res, next) {
  const u = currentUser(req);
  if (!u || u.status !== "approved") return res.status(401).json({ error: "Not logged in." });
  req.user = u; next();
}
function requireAdmin(req, res, next) {
  requireUser(req, res, () => {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Owner access only." });
    next();
  });
}
function startSession(res, userId) {
  const token = crypto.randomBytes(24).toString("hex");
  db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)").run(token, userId, now());
  res.cookie(COOKIE, token, cookieOpts);
}

/* ---------- simple login throttle ---------- */
const attempts = new Map();
function throttled(ip) {
  const rec = attempts.get(ip) || { n: 0, t: now() };
  if (now() - rec.t > 10 * 60 * 1000) { rec.n = 0; rec.t = now(); }
  rec.n++; attempts.set(ip, rec);
  return rec.n > 25;
}

/* ---------- bootstrap / auth ---------- */
app.get("/api/bootstrap", (req, res) => {
  const usersExist = db.prepare("SELECT COUNT(*) AS n FROM users").get().n > 0;
  res.json({ needsSetup: !usersExist, me: publicUser(currentUser(req)) });
});

app.post("/api/setup", (req, res) => {
  const usersExist = db.prepare("SELECT COUNT(*) AS n FROM users").get().n > 0;
  if (usersExist) return res.status(400).json({ error: "Setup already completed." });
  const { business, contact, phone, username, password } = req.body || {};
  if (!username || !username.trim() || !password || password.length < 6)
    return res.status(400).json({ error: "Username and a 6+ character password are required." });
  const info = db.prepare(`INSERT INTO users (username, hash, business, contact, phone, role, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'admin', 'approved', ?)`)
    .run(username.trim().toLowerCase(), bcrypt.hashSync(password, 10), (business || "Converter Express").trim(), (contact || "").trim(), (phone || "").trim(), now());
  startSession(res, info.lastInsertRowid);
  res.json({ ok: true, me: publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(info.lastInsertRowid)) });
});

app.post("/api/register", (req, res) => {
  const { business, contact, phone, username, password } = req.body || {};
  if (!business || !business.trim() || !username || !username.trim() || !password || password.length < 6)
    return res.status(400).json({ error: "Business name, username and a 6+ character password are required." });
  const uname = username.trim().toLowerCase();
  if (db.prepare("SELECT id FROM users WHERE username=?").get(uname))
    return res.status(400).json({ error: "That username is taken." });
  db.prepare(`INSERT INTO users (username, hash, business, contact, phone, role, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'customer', 'pending', ?)`)
    .run(uname, bcrypt.hashSync(password, 10), business.trim(), (contact || "").trim(), (phone || "").trim(), now());
  res.json({ ok: true, pending: true });
});

app.post("/api/login", (req, res) => {
  if (throttled(req.ip)) return res.status(429).json({ error: "Too many attempts — wait a few minutes." });
  const { username, password } = req.body || {};
  const u = db.prepare("SELECT * FROM users WHERE username=?").get((username || "").trim().toLowerCase());
  if (!u || !bcrypt.compareSync(password || "", u.hash)) return res.status(400).json({ error: "Wrong username or password." });
  if (u.status === "pending") return res.status(403).json({ error: "PENDING" });
  if (u.status === "disabled") return res.status(403).json({ error: "This account has been disabled. Contact Converter Express." });
  startSession(res, u.id);
  res.json({ ok: true, me: publicUser(u) });
});

app.post("/api/logout", (req, res) => {
  const token = req.cookies[COOKIE];
  if (token) db.prepare("DELETE FROM sessions WHERE token=?").run(token);
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

/* ---------- parts ---------- */
app.get("/api/parts", requireUser, (req, res) => {
  res.json({ parts: db.prepare("SELECT * FROM parts ORDER BY series, CAST(pn AS INTEGER), pn").all() });
});

app.post("/api/parts", requireAdmin, (req, res) => {
  const { pn, series, descr, in_stock } = req.body || {};
  if (!pn || !pn.trim()) return res.status(400).json({ error: "Part number required." });
  const clean = pn.trim();
  if (db.prepare("SELECT pn FROM parts WHERE pn=?").get(clean)) return res.status(400).json({ error: `Part ${clean} already exists.` });
  db.prepare("INSERT INTO parts (pn, series, eo, descr, in_stock) VALUES (?, ?, '', ?, ?)")
    .run(clean, (series || "—").trim(), (descr || "").trim(), in_stock === false ? 0 : 1);
  res.json({ ok: true });
});

app.patch("/api/parts/:pn", requireAdmin, (req, res) => {
  const p = db.prepare("SELECT * FROM parts WHERE pn=?").get(req.params.pn);
  if (!p) return res.status(404).json({ error: "Part not found." });
  const { in_stock, descr, series } = req.body || {};
  db.prepare("UPDATE parts SET in_stock=?, descr=?, series=? WHERE pn=?").run(
    in_stock === undefined ? p.in_stock : (in_stock ? 1 : 0),
    descr === undefined ? p.descr : String(descr).trim(),
    series === undefined ? p.series : String(series).trim(),
    p.pn
  );
  res.json({ ok: true });
});

app.post("/api/parts/bulk", requireAdmin, (req, res) => {
  const { pns, in_stock } = req.body || {};
  if (!Array.isArray(pns) || pns.length === 0) return res.status(400).json({ error: "No parts given." });
  const upd = db.prepare("UPDATE parts SET in_stock=? WHERE pn=?");
  db.exec("BEGIN");
  try { pns.forEach((pn) => upd.run(in_stock ? 1 : 0, String(pn))); db.exec("COMMIT"); }
  catch (e) { db.exec("ROLLBACK"); throw e; }
  res.json({ ok: true, count: pns.length });
});

app.delete("/api/parts/:pn", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM parts WHERE pn=?").run(req.params.pn);
  res.json({ ok: true });
});

/* ---------- orders ---------- */
app.post("/api/orders", requireUser, (req, res) => {
  const { items, notes } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "Order is empty." });
  const id = "CE-" + Date.now().toString(36).toUpperCase();
  const getPart = db.prepare("SELECT * FROM parts WHERE pn=?");
  const insOrder = db.prepare(`INSERT INTO orders (id, user_id, business, contact, phone, notes, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'new', ?)`);
  const insItem = db.prepare("INSERT INTO order_items (order_id, pn, descr, series, qty) VALUES (?, ?, ?, ?, ?)");
  db.exec("BEGIN");
  try {
    insOrder.run(id, req.user.id, req.user.business, req.user.contact, req.user.phone, String(notes || "").slice(0, 2000), now());
    for (const it of items) {
      const qty = Math.max(1, Math.min(99, parseInt(it.qty, 10) || 1));
      const p = getPart.get(String(it.pn)) || { descr: "", series: "" };
      insItem.run(id, String(it.pn), p.descr, p.series, qty);
    }
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  res.json({ ok: true, id });
});

app.get("/api/orders", requireUser, (req, res) => {
  const rows = req.user.role === "admin"
    ? db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all()
    : db.prepare("SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC").all(req.user.id);
  const itemsStmt = db.prepare("SELECT pn, descr, series, qty FROM order_items WHERE order_id=?");
  res.json({ orders: rows.map((o) => ({ ...o, items: itemsStmt.all(o.id) })) });
});

app.patch("/api/orders/:id", requireAdmin, (req, res) => {
  const { status } = req.body || {};
  if (!["new", "confirmed", "delivered", "cancelled"].includes(status)) return res.status(400).json({ error: "Bad status." });
  const r = db.prepare("UPDATE orders SET status=? WHERE id=?").run(status, req.params.id);
  if (!r.changes) return res.status(404).json({ error: "Order not found." });
  res.json({ ok: true });
});

/* ---------- customers (admin) ---------- */
app.get("/api/users", requireAdmin, (req, res) => {
  res.json({ users: db.prepare("SELECT * FROM users ORDER BY created_at DESC").all().map(publicUser) });
});

app.patch("/api/users/:id", requireAdmin, (req, res) => {
  const { status } = req.body || {};
  if (!["approved", "disabled", "pending"].includes(status)) return res.status(400).json({ error: "Bad status." });
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: "You can't change your own account." });
  const r = db.prepare("UPDATE users SET status=? WHERE id=?").run(status, req.params.id);
  if (!r.changes) return res.status(404).json({ error: "Account not found." });
  if (status === "disabled") db.prepare("DELETE FROM sessions WHERE user_id=?").run(req.params.id);
  res.json({ ok: true });
});

/* ---------- backup export (admin) ---------- */
app.get("/api/export", requireAdmin, (req, res) => {
  res.json({
    exported_at: new Date().toISOString(),
    users: db.prepare("SELECT id, username, business, contact, phone, role, status, created_at FROM users").all(),
    parts: db.prepare("SELECT * FROM parts").all(),
    orders: db.prepare("SELECT * FROM orders").all(),
    order_items: db.prepare("SELECT * FROM order_items").all(),
  });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Converter Express portal running on port ${PORT}`));
