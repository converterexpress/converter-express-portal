const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, "converter-express.db"));
db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  hash TEXT NOT NULL,
  business TEXT DEFAULT '',
  contact TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'customer',      -- admin | customer
  status TEXT NOT NULL DEFAULT 'pending',     -- pending | approved | disabled
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS parts (
  pn TEXT PRIMARY KEY,
  series TEXT DEFAULT '',
  eo TEXT DEFAULT '',
  descr TEXT DEFAULT '',
  in_stock INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  business TEXT, contact TEXT, phone TEXT,
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',         -- new | confirmed | delivered | cancelled
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS order_items (
  order_id TEXT NOT NULL,
  pn TEXT NOT NULL,
  descr TEXT DEFAULT '',
  series TEXT DEFAULT '',
  qty INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
`);

// Seed the parts catalog on first run (CARB EOs D-724-4 / -5 / -7 / -8 + manual additions)
const partCount = db.prepare("SELECT COUNT(*) AS n FROM parts").get().n;
if (partCount === 0) {
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, "seed-parts.json"), "utf8"));
  const ins = db.prepare("INSERT OR IGNORE INTO parts (pn, series, eo, descr, in_stock) VALUES (?, ?, ?, ?, ?)");
  db.exec("BEGIN");
  try {
    seed.forEach((r) => ins.run(r.pn, r.series, r.eo, r.descr, r.in_stock));
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  console.log(`Seeded ${seed.length} parts from CARB EO lists`);
}

module.exports = db;
