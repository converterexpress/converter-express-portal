/* Converter Express portal — vanilla JS SPA */
(() => {
  const root = document.getElementById("root");
  const S = {
    phase: "boot", me: null,
    parts: [], orders: [], users: [],
    tab: "catalog", authMode: "login",
    cart: {}, cartOpen: false, notes: "", placed: null,
    f: { q: "", series: "all", stock: "in" },        // customer catalog filters
    af: { q: "", series: "all", stock: "all" },      // admin inventory filters
    of: "all",                                        // admin order status filter
    open: null, openC: null, adding: false, err: "", busy: false,
  };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = (ts) => new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  async function api(path, method = "GET", body) {
    const r = await fetch("/api/" + path, {
      method, credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw d;
    return d;
  }

  function flash(msg) {
    const el = document.createElement("div");
    el.className = "flash"; el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }

  /* ---------- data loading ---------- */
  async function loadAll() {
    S.busy = true; render();
    try {
      const jobs = [api("parts"), api("orders")];
      if (S.me.role === "admin") jobs.push(api("users"));
      const [p, o, u] = await Promise.all(jobs);
      S.parts = p.parts; S.orders = o.orders;
      if (u) S.users = u.users;
    } catch (e) { if (e && e.error) flash(e.error); }
    S.busy = false; render();
  }

  async function boot() {
    try {
      const b = await api("bootstrap");
      if (b.needsSetup) { S.phase = "setup"; }
      else if (b.me && b.me.status === "approved") {
        S.me = b.me; S.phase = "app";
        S.tab = b.me.role === "admin" ? "inventory" : "catalog";
        render(); await loadAll(); return;
      } else S.phase = "auth";
    } catch { S.phase = "auth"; }
    render();
  }

  /* ---------- actions (exposed for inline handlers) ---------- */
  const A = window.A = {
    v(id) { return (document.getElementById(id) || {}).value || ""; },

    async setup() {
      S.err = "";
      const body = { business: A.v("f-business"), contact: A.v("f-contact"), phone: A.v("f-phone"), username: A.v("f-username"), password: A.v("f-password") };
      if (!body.username.trim() || body.password.length < 6) { S.err = "Pick a username and a password of at least 6 characters."; return render(); }
      try {
        const r = await api("setup", "POST", body);
        S.me = r.me; S.phase = "app"; S.tab = "inventory";
        render(); flash("Owner account created — catalog seeded from CARB EO lists");
        await loadAll();
      } catch (e) { S.err = e.error || "Setup failed."; render(); }
    },

    setAuthMode(m) { S.authMode = m; S.err = ""; render(); },

    async login() {
      S.err = "";
      try {
        const r = await api("login", "POST", { username: A.v("f-username"), password: A.v("f-password") });
        S.me = r.me; S.phase = "app"; S.tab = r.me.role === "admin" ? "inventory" : "catalog";
        S.cart = {}; render(); await loadAll();
      } catch (e) {
        if (e.error === "PENDING") { S.authMode = "pending"; } else { S.err = e.error || "Login failed."; }
        render();
      }
    },

    async register() {
      S.err = "";
      const body = { business: A.v("f-business"), contact: A.v("f-contact"), phone: A.v("f-phone"), username: A.v("f-username"), password: A.v("f-password") };
      try { await api("register", "POST", body); S.authMode = "requested"; render(); }
      catch (e) { S.err = e.error || "Could not submit."; render(); }
    },

    async logout() { try { await api("logout", "POST", {}); } catch {} S.me = null; S.phase = "auth"; S.authMode = "login"; S.cart = {}; render(); },

    async goTab(t) { S.tab = t; S.open = null; render(); await loadAll(); },
    refresh() { return loadAll(); },

    /* filters */
    filt(k, id) { S.f[k] = A.v(id); render(); },
    afilt(k, id) { S.af[k] = A.v(id); render(); },
    setOf(v) { S.of = v; render(); },
    toggleOpen(id) { S.open = S.open === id ? null : id; render(); },
    toggleCart() { S.cartOpen = !S.cartOpen; render(); },

    /* cart */
    bump(pn, d) {
      const n = Math.max(0, Math.min(99, (S.cart[pn] || 0) + d));
      if (n === 0) delete S.cart[pn]; else S.cart[pn] = n;
      render();
    },
    saveNotes() { S.notes = A.v("f-notes"); },

    async placeOrder() {
      S.notes = A.v("f-notes") || S.notes;
      const items = Object.entries(S.cart).map(([pn, qty]) => ({ pn, qty }));
      if (!items.length) return;
      try {
        const r = await api("orders", "POST", { items, notes: S.notes });
        S.placed = { id: r.id, items: items.map((it) => ({ ...it, d: (S.parts.find((p) => p.pn === it.pn) || {}).descr || "" })) };
        S.cart = {}; S.notes = ""; S.cartOpen = false;
        render();
      } catch (e) { flash(e.error || "Order failed"); }
    },
    backToCatalog() { S.placed = null; render(); loadAll(); },

    /* admin inventory */
    async toggleStock(pn) {
      const p = S.parts.find((x) => x.pn === pn); if (!p) return;
      try { await api("parts/" + encodeURIComponent(pn), "PATCH", { in_stock: !p.in_stock }); p.in_stock = p.in_stock ? 0 : 1; render(); }
      catch (e) { flash(e.error || "Save failed"); }
    },
    async editDesc(pn) {
      const p = S.parts.find((x) => x.pn === pn); if (!p) return;
      const d = prompt("Description for part " + pn + ":", p.descr || "");
      if (d === null) return;
      try { await api("parts/" + encodeURIComponent(pn), "PATCH", { descr: d }); p.descr = d; render(); }
      catch (e) { flash(e.error || "Save failed"); }
    },
    async delPart(pn) {
      if (!confirm("Delete part " + pn + " from the catalog?")) return;
      try { await api("parts/" + encodeURIComponent(pn), "DELETE"); S.parts = S.parts.filter((x) => x.pn !== pn); render(); }
      catch (e) { flash(e.error || "Delete failed"); }
    },
    async bulk(val) {
      const pns = filteredAdmin().map((p) => p.pn);
      if (!pns.length) return;
      if (!confirm("Mark " + pns.length + " filtered part(s) as " + (val ? "IN STOCK" : "OUT OF STOCK") + "?")) return;
      try {
        await api("parts/bulk", "POST", { pns, in_stock: val });
        const set = new Set(pns);
        S.parts.forEach((p) => { if (set.has(p.pn)) p.in_stock = val ? 1 : 0; });
        render(); flash("Updated " + pns.length + " parts");
      } catch (e) { flash(e.error || "Bulk update failed"); }
    },
    toggleAdd() { S.adding = !S.adding; render(); },
    async addPart() {
      const body = { pn: A.v("np-pn"), descr: A.v("np-d"), series: A.v("np-s"), in_stock: true };
      if (!body.pn.trim()) return;
      try { await api("parts", "POST", body); S.adding = false; flash("Added " + body.pn.trim() + " (in stock)"); await loadAll(); }
      catch (e) { flash(e.error || "Add failed"); }
    },

    /* admin orders + customers */
    async setOrderStatus(id, status) {
      try { await api("orders/" + encodeURIComponent(id), "PATCH", { status }); const o = S.orders.find((x) => x.id === id); if (o) o.status = status; render(); }
      catch (e) { flash(e.error || "Update failed"); }
    },
    async setUserStatus(id, status) {
      try { await api("users/" + id, "PATCH", { status }); const u = S.users.find((x) => x.id === id); if (u) u.status = status; render(); }
      catch (e) { flash(e.error || "Update failed"); }
    },
  };

  /* ---------- filtering ---------- */
  function applyFilter(list, f) {
    const q = f.q.trim().toLowerCase();
    return list.filter((p) => {
      if (f.series !== "all" && p.series !== f.series) return false;
      if (f.stock === "in" && !p.in_stock) return false;
      if (f.stock === "out" && p.in_stock) return false;
      if (q && !(p.pn.toLowerCase().includes(q) || (p.descr || "").toLowerCase().includes(q))) return false;
      return true;
    });
  }
  const filteredCatalog = () => applyFilter(S.parts, S.f);
  const filteredAdmin = () => applyFilter(S.parts, S.af);
  const seriesOptions = () => [...new Set(S.parts.map((p) => p.series))].sort();

  /* ---------- view pieces ---------- */
  const brand = (small) => `
    <div class="brand ${small ? "small" : ""}">
      <div class="word">CONVERTER<em>EXPRESS</em></div>
      <div class="sub">CARB-Compliant Catalytic Converter Distribution</div>
    </div>`;

  const field = (label, id, type = "text", val = "", ph = "") =>
    `<label class="f"><span>${label}</span><input class="in" id="${id}" type="${type}" value="${esc(val)}" placeholder="${esc(ph)}" autocapitalize="none" /></label>`;

  const filterBar = (f, fn, showStock) => `
    <div class="filters">
      <div class="grow"><input class="in" id="${fn}-q" placeholder="Search part # or description…" value="${esc(f.q)}" oninput="A.${fn}('q','${fn}-q')" /></div>
      <select class="in" id="${fn}-s" onchange="A.${fn}('series','${fn}-s')">
        <option value="all">All series</option>
        ${seriesOptions().map((s) => `<option value="${esc(s)}" ${f.series === s ? "selected" : ""}>Series ${esc(s)}</option>`).join("")}
      </select>
      ${showStock ? `<select class="in" id="${fn}-st" onchange="A.${fn}('stock','${fn}-st')">
        <option value="all" ${f.stock === "all" ? "selected" : ""}>All stock</option>
        <option value="in" ${f.stock === "in" ? "selected" : ""}>In stock</option>
        <option value="out" ${f.stock === "out" ? "selected" : ""}>Out of stock</option>
      </select>` : ""}
    </div>`;

  const itemsTable = (items) => `
    <div class="items">${items.map((it) => `
      <div class="it"><span><b>${esc(it.pn)}</b> <span class="d">${esc(it.descr || it.d || "")}</span></span><span><b>× ${it.qty}</b></span></div>`).join("")}
    </div>`;

  /* ---------- screens ---------- */
  function viewSetup() {
    return `<div class="auth-wrap"><div class="auth-box"><div class="panel">
      ${brand()}
      <div class="notice amber" style="margin-top:18px">🛡️ First-time setup — create the owner login. Do this before sharing the portal link.</div>
      ${field("Business name", "f-business", "text", "Converter Express")}
      ${field("Your name", "f-contact")}
      ${field("Phone", "f-phone")}
      ${field("Owner username", "f-username")}
      ${field("Password (6+ characters)", "f-password", "password")}
      ${S.err ? `<div class="notice red">${esc(S.err)}</div>` : ""}
      <button class="btn pri wide" onclick="A.setup()">Create owner account</button>
      <p style="font-size:12px;color:var(--muted);margin-bottom:0">The catalog is pre-loaded with every part number from CARB EOs D-724-4, -5, -7 and -8.</p>
    </div></div></div>`;
  }

  function viewAuth() {
    const m = S.authMode;
    if (m === "pending" || m === "requested") {
      return `<div class="auth-wrap"><div class="auth-box"><div class="panel">
        ${brand()}
        <div class="notice amber" style="margin-top:18px"><div>
          <div style="font-weight:900;text-transform:uppercase;letter-spacing:.15em">🛡️ Awaiting approval</div>
          <p style="margin:8px 0 0;font-weight:600">${m === "requested" ? "Your account request is in." : "Your account hasn’t been approved yet."} Converter Express reviews every new shop account before first login — usually same day. Check back soon.</p>
        </div></div>
        <button class="btn sec" onclick="A.setAuthMode('login')">Back to login</button>
      </div></div></div>`;
    }
    return `<div class="auth-wrap"><div class="auth-box"><div class="panel">
      ${brand()}
      <div class="mode-switch">
        <button class="${m === "login" ? "on" : ""}" onclick="A.setAuthMode('login')">Log in</button>
        <button class="${m === "register" ? "on" : ""}" onclick="A.setAuthMode('register')">Request account</button>
      </div>
      ${m === "register" ? field("Shop / business name", "f-business", "text", "", "e.g. Valley Muffler & Smog") + field("Contact name", "f-contact") + field("Phone", "f-phone", "text", "", "(___) ___-____") : ""}
      ${field("Username", "f-username")}
      ${field("Password", "f-password", "password")}
      ${S.err ? `<div class="notice red">${esc(S.err)}</div>` : ""}
      ${m === "login"
        ? `<button class="btn pri wide" onclick="A.login()">🔒 Log in</button>`
        : `<button class="btn pri wide" onclick="A.register()">Request account</button>
           <p style="font-size:12px;color:var(--muted);margin-bottom:0">New accounts must be approved by Converter Express before they can log in.</p>`}
    </div><div class="center-note">Walk-in B2B route sales • Central Valley &amp; Bay Area</div></div></div>`;
  }

  /* ---------- customer: catalog ---------- */
  function viewCatalog() {
    if (S.placed) {
      return `<div class="panel" style="max-width:520px;margin:0 auto">
        <div class="kicker" style="color:var(--green)">✔ Order placed</div>
        <div class="pn" style="font-size:30px">${esc(S.placed.id)}</div>
        <div style="margin:14px 0">${itemsTable(S.placed.items)}</div>
        <div class="notice amber">🚚 No online payment — pay in person on delivery (cash, check, or card). Converter Express will confirm your order.</div>
        <button class="btn pri wide" onclick="A.backToCatalog()">Back to catalog</button>
      </div>`;
    }
    const list = filteredCatalog();
    const shown = list.slice(0, 80);
    const cartItems = Object.entries(S.cart);
    const cartCount = cartItems.reduce((a, [, n]) => a + n, 0);
    return `
      ${filterBar(S.f, "filt", true)}
      ${cartCount > 0 ? `
        <div class="cart-panel">
          <button class="cart-head" onclick="A.toggleCart()">
            <span>🛒 Order ticket — ${cartCount} unit${cartCount > 1 ? "s" : ""}</span><span>${S.cartOpen ? "▲" : "▼"}</span>
          </button>
          ${S.cartOpen ? `<div class="cart-body">
            <div class="items">${cartItems.map(([pn, qty]) => `
              <div class="it"><b>${esc(pn)}</b>
                <span class="qty">
                  <button class="btn sec tiny" onclick="A.bump('${esc(pn)}',-1)">−</button><b>${qty}</b><button class="btn sec tiny" onclick="A.bump('${esc(pn)}',1)">+</button>
                </span></div>`).join("")}
            </div>
            <label class="f" style="margin-top:12px"><span>Notes for Converter Express (vehicle, timing, PO#…)</span>
              <textarea class="in" id="f-notes" rows="2" oninput="A.saveNotes()">${esc(S.notes)}</textarea></label>
            <p style="font-size:12px;font-weight:700;color:var(--muted);margin:0 0 10px">🚚 Pay in person on delivery — no online payment.</p>
            <button class="btn pri wide" onclick="A.placeOrder()">Place order</button>
          </div>` : ""}
        </div>` : ""}
      <div class="count-line">${list.length} part${list.length !== 1 ? "s" : ""}${list.length > 80 ? " — showing first 80, refine your search" : ""}</div>
      <div class="stack">
        ${shown.map((p) => `
          <div class="card row">
            <div><div class="pn">${esc(p.pn)}</div>
              <div class="meta">Series ${esc(p.series)}${p.descr ? " — " : ""}<span class="d">${esc(p.descr)}</span></div></div>
            <div style="display:flex;align-items:center;gap:12px">
              <span class="tag ${p.in_stock ? "in" : "out"}">${p.in_stock ? "IN STOCK" : "OUT"}</span>
              ${p.in_stock ? (S.cart[p.pn]
                ? `<span class="qty"><button class="btn sec tiny" onclick="A.bump('${esc(p.pn)}',-1)">−</button><b>${S.cart[p.pn]}</b><button class="btn sec tiny" onclick="A.bump('${esc(p.pn)}',1)">+</button></span>`
                : `<button class="btn sec" onclick="A.bump('${esc(p.pn)}',1)">+ Add</button>`) : ""}
            </div>
          </div>`).join("")}
        ${shown.length === 0 ? `<div class="empty">No parts match. Try “All stock” to browse the full CARB-approved catalog, or add a note in your order for a part you need.</div>` : ""}
      </div>`;
  }

  function viewMyOrders() {
    const mine = S.orders;
    if (!mine.length) return `<div class="empty">No orders yet — place one from the Catalog tab.</div>`;
    return `<div class="stack">${mine.map((o) => `
      <div class="o-card">
        <button class="o-head" onclick="A.toggleOpen('${esc(o.id)}')">
          <span class="id">${esc(o.id)}</span>
          <span class="right">${fmtDate(o.created_at)} <span class="chip ${esc(o.status)}">${esc(o.status)}</span></span>
        </button>
        ${S.open === o.id ? `<div class="o-body">
          ${itemsTable(o.items)}
          ${o.notes ? `<p style="font-size:13px;margin:10px 0 0"><span class="meta">Notes:</span> ${esc(o.notes)}</p>` : ""}
          <p style="font-size:12px;font-weight:700;color:#92400e;margin:10px 0 0">🚚 Payment collected in person on delivery.</p>
        </div>` : ""}
      </div>`).join("")}</div>`;
  }

  /* ---------- admin: inventory ---------- */
  function viewInventory() {
    const list = filteredAdmin();
    const shown = list.slice(0, 80);
    const inStock = S.parts.filter((p) => p.in_stock).length;
    return `
      <div class="row" style="margin-bottom:12px">
        <div class="count-line" style="margin:0">${S.parts.length} parts in catalog · <span style="color:var(--green)">${inStock} in stock</span></div>
        <button class="btn pri" onclick="A.toggleAdd()">+ Add part</button>
      </div>
      ${S.adding ? `<div class="panel addform" style="padding:16px">
        <label class="f"><span>Part #</span><input class="in" id="np-pn" /></label>
        <label class="f"><span>Description</span><input class="in" id="np-d" placeholder="e.g. Corolla semi direct fit" /></label>
        <label class="f"><span>Series</span><input class="in" id="np-s" placeholder="e.g. 5000" /></label>
        <button class="btn pri" style="margin-bottom:12px" onclick="A.addPart()">Save</button>
      </div>` : ""}
      ${filterBar(S.af, "afilt", true)}
      <div class="pillbar">
        <button onclick="A.bulk(true)">Mark filtered in stock</button>
        <button onclick="A.bulk(false)">Mark filtered out</button>
      </div>
      <div class="count-line">${list.length} match${list.length !== 1 ? "es" : ""}${list.length > 80 ? " — showing first 80" : ""}</div>
      <div class="stack">
        ${shown.map((p) => `
          <div class="card row">
            <div><div class="pn">${esc(p.pn)}</div>
              <div class="meta">Series ${esc(p.series)}${p.eo ? " · " + esc(p.eo) : ""}${p.descr ? " — " : ""}<span class="d">${esc(p.descr)}</span>
                <button class="btn ghost" title="Edit description" onclick="A.editDesc('${esc(p.pn)}')">✎</button></div></div>
            <div style="display:flex;align-items:center;gap:8px">
              <button class="stock-toggle ${p.in_stock ? "in" : "out"}" onclick="A.toggleStock('${esc(p.pn)}')">${p.in_stock ? "IN STOCK" : "OUT"}</button>
              <button class="btn sec tiny" title="Delete" onclick="A.delPart('${esc(p.pn)}')">🗑</button>
            </div>
          </div>`).join("")}
        ${shown.length === 0 ? `<div class="empty">No parts match this filter.</div>` : ""}
      </div>`;
  }

  /* ---------- admin: orders ---------- */
  function viewOrders() {
    const list = S.orders.filter((o) => S.of === "all" || o.status === S.of);
    return `
      <div class="pillbar">${["all", "new", "confirmed", "delivered", "cancelled"].map((s) =>
        `<button class="${S.of === s ? "on" : ""}" onclick="A.setOf('${s}')">${s}</button>`).join("")}</div>
      ${!list.length ? `<div class="empty">No orders here yet. New orders from approved shops land in this list.</div>` : ""}
      <div class="stack">${list.map((o) => `
        <div class="o-card">
          <button class="o-head" onclick="A.toggleOpen('${esc(o.id)}')">
            <span><span class="id">${esc(o.id)}</span><span class="sub">${esc(o.business || "")}${o.contact ? " · " + esc(o.contact) : ""}</span></span>
            <span class="right">${fmtDate(o.created_at)} <span class="chip ${esc(o.status)}">${esc(o.status)}</span></span>
          </button>
          ${S.open === o.id ? `<div class="o-body">
            ${itemsTable(o.items)}
            ${o.notes ? `<p style="font-size:13px;margin:10px 0 0"><span class="meta">Notes:</span> ${esc(o.notes)}</p>` : ""}
            ${o.phone ? `<p style="font-size:13px;font-weight:800;margin:8px 0 0">📞 ${esc(o.phone)}</p>` : ""}
            <div class="pillbar" style="margin:12px 0 0">
              ${o.status === "new" ? `<button class="btn pri" onclick="A.setOrderStatus('${esc(o.id)}','confirmed')">✔ Confirm</button>` : ""}
              ${o.status === "new" || o.status === "confirmed" ? `<button class="btn sec" onclick="A.setOrderStatus('${esc(o.id)}','delivered')">🚚 Delivered / paid</button>` : ""}
              ${o.status !== "cancelled" && o.status !== "delivered" ? `<button class="btn sec" onclick="A.setOrderStatus('${esc(o.id)}','cancelled')">✕ Cancel</button>` : ""}
            </div>
          </div>` : ""}
        </div>`).join("")}</div>`;
  }

  /* ---------- admin: customers ---------- */
  function viewCustomers() {
    const pending = S.users.filter((u) => u.status === "pending");
    const rest = S.users.filter((u) => u.status !== "pending" && u.id !== S.me.id);
    const card = (u, actions) => `
      <div class="card row">
        <div><div style="font-weight:900">${esc(u.business || "—")}</div>
          <div class="meta d">${esc(u.contact || "")}${u.phone ? " · " + esc(u.phone) : ""} · <span style="font-family:var(--mono)">${esc(u.username)}</span> · ${fmtDate(u.created_at)}</div></div>
        <div style="display:flex;align-items:center;gap:8px">${actions}</div>
      </div>`;
    return `
      <p class="kicker">🛡️ Pending approval (${pending.length})</p>
      <div class="stack" style="margin-bottom:22px">
        ${!pending.length ? `<div class="empty">No account requests waiting. New shop sign-ups appear here for your approval.</div>` : ""}
        ${pending.map((u) => card(u, `
          <button class="btn pri" onclick="A.setUserStatus(${u.id},'approved')">✔ Approve</button>
          <button class="btn sec" onclick="A.setUserStatus(${u.id},'disabled')">✕ Reject</button>`)).join("")}
      </div>
      <p class="kicker">👥 Accounts (${rest.length})</p>
      <div class="stack">
        ${!rest.length ? `<div class="empty">No shop accounts yet — share the portal link with your route customers.</div>` : ""}
        ${rest.map((u) => card(u, `
          <span class="chip ${esc(u.status)}">${esc(u.status)}</span>
          ${u.status === "approved"
            ? `<button class="btn sec" onclick="A.setUserStatus(${u.id},'disabled')">Disable</button>`
            : `<button class="btn sec" onclick="A.setUserStatus(${u.id},'approved')">Re-enable</button>`}`)).join("")}
      </div>`;
  }

  /* ---------- app shell ---------- */
  function viewApp() {
    const isAdmin = S.me.role === "admin";
    const pendingCount = S.users.filter((u) => u.status === "pending").length;
    const newOrders = S.orders.filter((o) => o.status === "new").length;
    const tabs = isAdmin
      ? [["inventory", "📦 Inventory", 0], ["orders", "📋 Orders", newOrders], ["customers", "👥 Customers", pendingCount]]
      : [["catalog", "📦 Catalog", 0], ["myorders", "📋 My Orders", 0]];
    const body = isAdmin
      ? (S.tab === "inventory" ? viewInventory() : S.tab === "orders" ? viewOrders() : viewCustomers())
      : (S.tab === "catalog" ? viewCatalog() : viewMyOrders());
    return `
      <header class="top"><div class="wrap">
        <div class="top-row">
          ${brand(true)}
          <div class="top-right">
            <button class="btn sec tiny" title="Refresh" onclick="A.refresh()">${S.busy ? "…" : "⟳"}</button>
            <div class="who"><b>${esc(S.me.business || S.me.contact || S.me.username)}</b><span>${isAdmin ? "OWNER" : "APPROVED ACCOUNT"}</span></div>
            <button class="btn sec tiny" onclick="A.logout()">Log out</button>
          </div>
        </div>
        <nav class="tabs">${tabs.map(([id, label, badge]) => `
          <button class="${S.tab === id ? "on" : ""}" onclick="A.goTab('${id}')">${label}${badge > 0 ? ` <span class="badge">${badge}</span>` : ""}</button>`).join("")}
        </nav>
      </div></header>
      <main class="wrap">${body}</main>
      <footer class="note wrap">Orders are paid in person on delivery — cash, check, or card. Parts referenced against CARB Executive Orders D-724-4, D-724-5, D-724-7 and D-724-8 (Converter Unlimited, Inc.).</footer>`;
  }

  function render() {
    if (S.phase === "boot") { root.innerHTML = `<div class="boot">LOADING…</div>`; return; }
    if (S.phase === "setup") { root.innerHTML = viewSetup(); return; }
    if (S.phase === "auth") { root.innerHTML = viewAuth(); return; }
    root.innerHTML = viewApp();
  }

  boot();
})();
