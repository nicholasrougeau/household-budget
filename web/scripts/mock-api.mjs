// Dev-only, in-memory stand-in for the `api` edge function, so the UI can be clicked through
// without the real backend. Same routes and shapes. Any 6-digit PIN except 000000 works.
// Run: MOCK_DATA=path/to/mock_data.json node scripts/mock-api.mjs   (port 3310)
import http from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const PORT = 3310;
const src = process.env.MOCK_DATA ? JSON.parse(readFileSync(process.env.MOCK_DATA, "utf8")) : { accounts: [], categories: [], balances: [], settings: {}, entries: [] };
const now = () => new Date().toISOString();

const members = [
  { id: randomUUID(), email: "nick@example.com", name: "Nick", color: "#2F5D8A", must_change_pin: false, feed_seen_at: "2026-10-01T00:00:00Z", last_login_at: now() },
  { id: randomUUID(), email: "meghan@example.com", name: "Meghan", color: "#9C4A6B", must_change_pin: false, feed_seen_at: "2026-10-01T00:00:00Z", last_login_at: now() },
];
const accounts = src.accounts.map((a, i) => ({ id: randomUUID(), sort: (i + 1) * 10, archived: false, ...a }));
const categories = src.categories.map((c, i) => ({ id: randomUUID(), sort: (i + 1) * 10, archived: false, ...c }));
const acct = (n) => accounts.find((a) => a.name === n)?.id ?? null;
const ofKind = (k, i = 0) => accounts.filter((a) => a.kind === k)[i]?.id ?? null;
const cat = (n) => categories.find((c) => c.name === n)?.id ?? null;
const balances = src.balances.map((b) => ({ id: randomUUID(), account_id: acct(b.account), amount: b.amount, as_of: b.as_of, created_by: null, source: "statement", note: null, created_at: now() }));
const settings = { ...src.settings };
let entries = src.entries.map((e) => ({
  id: randomUUID(), kind: e.kind, occurred_on: e.occurred_on, amount: e.amount, title: e.title, category_id: cat(e.category),
  account_id: acct(e.account), to_account_id: acct(e.to_account), one_time: e.one_time, note: e.note, created_by: null, source: e.source,
  ext_ref: null, verified: e.verified, verified_ref: e.verified ? "Statement" : null, verified_at: null, flagged: false,
  created_at: e.occurred_on + "T18:00:00Z", updated_at: e.occurred_on + "T18:00:00Z", updated_by: null, deleted_at: null,
}));
let comments = [];
const checkins = [];

// A little October activity from the two of them, so the feed looks like real use.
const [nick, meg] = members;
const add = (who, e) => entries.push({ id: randomUUID(), one_time: false, note: null, source: "manual", ext_ref: null, verified: false, verified_ref: null, verified_at: null, flagged: false, created_by: who.id, updated_by: who.id, created_at: now(), updated_at: now(), deleted_at: null, to_account_id: null, ...e });
add(meg, { kind: "expense", occurred_on: "2026-10-16", amount: 142.37, title: "Rouses", category_id: cat("Groceries & baby"), account_id: ofKind("checking", 1) });
add(nick, { kind: "expense", occurred_on: "2026-10-17", amount: 86.4, title: "Date night at Luna", category_id: cat("Date nights"), account_id: ofKind("credit", 0), note: "Anniversary dinner" });
add(meg, { kind: "expense", occurred_on: "2026-10-17", amount: 38.99, title: "Diapers + wipes", category_id: cat("Groceries & baby"), account_id: ofKind("checking", 1), flagged: true });
add(nick, { kind: "expense", occurred_on: "2026-10-18", amount: 412.5, title: "Brake pads + rotors", category_id: cat("Car & home upkeep"), account_id: ofKind("credit", 1), one_time: true });
comments.push({ id: randomUUID(), entry_id: entries.at(-2).id, author_id: meg.id, body: "Found a coupon for these at Target, I'll grab them there next time", created_at: now() });

const tokenFor = (m) => "mock." + m.id;
const meFrom = (req) => members.find((m) => "mock." + m.id === req.headers["x-session"]);
const withCounts = (e) => ({ ...e, comment_count: comments.filter((c) => c.entry_id === e.id).length });

function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, x-session",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

http
  .createServer(async (req, res) => {
    if (req.method === "OPTIONS") return send(res, 204);
    const url = new URL(req.url, "http://x");
    const path = url.pathname.replace(/^\/api/, "") || "/";
    let body = {};
    if (!["GET", "DELETE"].includes(req.method)) {
      let raw = "";
      for await (const c of req) raw += c;
      try { body = JSON.parse(raw || "{}"); } catch { body = {}; }
    }
    const M = req.method;
    if (path === "/auth/login" && M === "POST") {
      const m = members.find((x) => x.email === String(body.email).toLowerCase());
      if (!m || body.pin === "000000") return send(res, 401, { error: "invalid", message: "That email and PIN don't match", tries_left: 2 });
      return send(res, 200, { token: tokenFor(m), me: m });
    }
    const me = meFrom(req);
    if (!me) return send(res, 401, { error: "signed_out", message: "Please sign in again" });
    if (path === "/auth/pin") return send(res, 200, { token: tokenFor(me) });
    if (path === "/state") {
      const newE = entries.filter((e) => !e.deleted_at && e.created_at > me.feed_seen_at && e.created_by !== me.id).map((e) => e.id);
      const newC = comments.filter((c) => c.created_at > me.feed_seen_at && c.author_id !== me.id);
      return send(res, 200, {
        me, members, accounts, categories, settings, checkins,
        balances: [...balances].sort((a, b) => b.as_of.localeCompare(a.as_of) || b.created_at.localeCompare(a.created_at)),
        unread: { entries: newE, comment_entries: [...new Set(newC.map((c) => c.entry_id))], comments: newC.length },
      });
    }
    if (path === "/seen") { me.feed_seen_at = now(); return send(res, 200, { ok: true }); }
    if (path === "/entries" && M === "GET") {
      const p = url.searchParams;
      let list = entries.filter((e) => !e.deleted_at);
      if (p.get("from")) list = list.filter((e) => e.occurred_on >= p.get("from"));
      if (p.get("to")) list = list.filter((e) => e.occurred_on <= p.get("to"));
      const who = p.get("who");
      if (who === "claude") list = list.filter((e) => !e.created_by);
      else if (who) list = list.filter((e) => e.created_by === who);
      if (p.get("flagged")) list = list.filter((e) => e.flagged);
      if (p.get("one_time")) list = list.filter((e) => e.one_time);
      if (p.get("unverified")) list = list.filter((e) => !e.verified);
      if (p.get("category_id")) list = list.filter((e) => e.category_id === p.get("category_id"));
      if (p.get("account_id")) list = list.filter((e) => e.account_id === p.get("account_id") || e.to_account_id === p.get("account_id"));
      const q = (p.get("q") || "").toLowerCase();
      if (q) list = list.filter((e) => e.title.toLowerCase().includes(q) || (e.note || "").toLowerCase().includes(q));
      list.sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at));
      const lim = Number(p.get("limit") || 2000);
      return send(res, 200, { entries: list.slice(0, lim).map(withCounts) });
    }
    if (path === "/entries" && M === "POST") {
      const e = { id: randomUUID(), ...body, created_by: me.id, updated_by: me.id, source: "manual", verified: false, flagged: !!body.flagged, created_at: now(), updated_at: now(), deleted_at: null };
      entries.push(e);
      return send(res, 200, { entry: withCounts(e) });
    }
    let r = path.match(/^\/entries\/([\w-]+)$/);
    if (r) {
      const e = entries.find((x) => x.id === r[1]);
      if (!e) return send(res, 404, { error: "not_found", message: "Not found" });
      if (M === "GET") return send(res, 200, { entry: e, comments: comments.filter((c) => c.entry_id === e.id) });
      if (M === "PATCH") { Object.assign(e, body, { updated_by: me.id, updated_at: now() }); return send(res, 200, { entry: e }); }
      if (M === "DELETE") { e.deleted_at = now(); return send(res, 200, { ok: true }); }
    }
    r = path.match(/^\/entries\/([\w-]+)\/comments$/);
    if (r && M === "POST") {
      const c = { id: randomUUID(), entry_id: r[1], author_id: me.id, body: body.body, created_at: now() };
      comments.push(c);
      return send(res, 200, { comment: c });
    }
    r = path.match(/^\/comments\/([\w-]+)$/);
    if (r && M === "DELETE") { comments = comments.filter((c) => c.id !== r[1]); return send(res, 200, { ok: true }); }
    if (path === "/balances" && M === "POST") {
      const rows = body.items.map((it) => ({ id: randomUUID(), account_id: it.account_id, amount: Number(it.amount), as_of: body.as_of, created_by: me.id, source: "manual", note: null, created_at: now() }));
      balances.push(...rows);
      return send(res, 200, { balances: rows });
    }
    r = path.match(/^\/(accounts|categories)\/([\w-]+)$/);
    if (r && M === "PATCH") {
      const list = r[1] === "accounts" ? accounts : categories;
      const x = list.find((y) => y.id === r[2]);
      Object.assign(x, body);
      return send(res, 200, { [r[1].slice(0, -1)]: x });
    }
    if ((path === "/accounts" || path === "/categories") && M === "POST") {
      const x = { id: randomUUID(), archived: false, ...body };
      (path === "/accounts" ? accounts : categories).push(x);
      return send(res, 200, { x });
    }
    r = path.match(/^\/settings\/(\w+)$/);
    if (r) { settings[r[1]] = body.value; return send(res, 200, { ok: true }); }
    r = path.match(/^\/members\/([\w-]+)(\/reset-pin)?$/);
    if (r && r[2]) return send(res, 200, { pin: "482915" });
    if (r) { Object.assign(members.find((m) => m.id === r[1]), body); return send(res, 200, { ok: true }); }
    send(res, 404, { error: "not_found", message: "Not found" });
  })
  .listen(PORT, () => console.log(`mock api on http://localhost:${PORT}  (${entries.length} entries)`));
