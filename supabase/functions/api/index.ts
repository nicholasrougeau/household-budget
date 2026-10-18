// Household budget API. The browser never talks to the database directly: every request
// carries an `x-session` token minted here after an email + PIN check, and this function
// uses the service key on its behalf. Deployed with verify_jwt = false (we do our own auth).
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SERVICE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SESSION_SECRET = Deno.env.get("SESSION_SECRET")!;
const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const SESSION_DAYS = 45;
const REFRESH_AFTER_DAYS = 7;
const MEMBER_COLS = "id,email,name,color,must_change_pin,session_version,last_login_at,feed_seen_at,created_at";

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string, public extra?: Record<string, unknown>) {
    super(message ?? code);
  }
}
const bad = (message: string) => new HttpError(400, "bad_input", message);

// ---------- session tokens (HMAC-SHA256) ----------
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64u = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) =>
    c.charCodeAt(0)
  );
let keyPromise: Promise<CryptoKey> | null = null;
const hmacKey = () =>
  (keyPromise ??= crypto.subtle.importKey("raw", enc.encode(SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]));

async function signToken(sub: string, v: number) {
  const now = Math.floor(Date.now() / 1000);
  const body = b64u(enc.encode(JSON.stringify({ sub, v, iat: now, exp: now + SESSION_DAYS * 86400 })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(body)));
  return `${body}.${b64u(sig)}`;
}

async function readToken(token: string) {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    if (!(await crypto.subtle.verify("HMAC", await hmacKey(), unb64u(sig), enc.encode(body)))) return null;
    const p = JSON.parse(dec.decode(unb64u(body)));
    if (typeof p.exp !== "number" || p.exp < Date.now() / 1000) return null;
    return p as { sub: string; v: number; iat: number; exp: number };
  } catch {
    return null;
  }
}

type Member = {
  id: string;
  email: string;
  name: string;
  color: string;
  must_change_pin: boolean;
  session_version: number;
  last_login_at: string | null;
  feed_seen_at: string;
  created_at: string;
};

async function requireMember(req: Request) {
  const p = await readToken(req.headers.get("x-session") ?? "");
  if (!p) throw new HttpError(401, "signed_out", "Please sign in again");
  const { data: me, error } = await db.from("members").select(MEMBER_COLS).eq("id", p.sub).maybeSingle();
  if (error) throw error;
  if (!me || me.session_version !== p.v) throw new HttpError(401, "signed_out", "Please sign in again");
  const refresh =
    Date.now() / 1000 - p.iat > REFRESH_AFTER_DAYS * 86400 ? await signToken(me.id, me.session_version) : undefined;
  return { me: me as Member, refresh };
}

const publicMember = (m: Member) => ({
  id: m.id,
  email: m.email,
  name: m.name,
  color: m.color,
  must_change_pin: m.must_change_pin,
  last_login_at: m.last_login_at,
  feed_seen_at: m.feed_seen_at,
});

// ---------- input checks ----------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isDate = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T00:00:00Z"));

function num(v: unknown, field: string, { min = 0, allowZero = false, max = 10_000_000 } = {}) {
  const n = typeof v === "string" ? Number(v.replace(/[$,\s]/g, "")) : Number(v);
  if (!Number.isFinite(n) || n < min || (!allowZero && n === 0) || n > max) throw bad(`${field} isn't a valid amount`);
  return Math.round(n * 100) / 100;
}
function optNum(v: unknown, field: string) {
  return v === null || v === undefined || v === "" ? null : num(v, field, { allowZero: true });
}
function str(v: unknown, max: number, field: string, required = false) {
  if (v === null || v === undefined || v === "") {
    if (required) throw bad(`${field} is required`);
    return null;
  }
  if (typeof v !== "string") throw bad(`${field} must be text`);
  const s = v.trim();
  if (!s && required) throw bad(`${field} is required`);
  if (s.length > max) throw bad(`${field} is too long`);
  return s || null;
}
function optId(v: unknown, field: string) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" || !UUID_RE.test(v)) throw bad(`${field} is invalid`);
  return v;
}
function optDate(v: unknown, field: string) {
  if (v === null || v === undefined || v === "") return null;
  if (!isDate(v)) throw bad(`${field} must be a date`);
  return v;
}

function weakPin(pin: string) {
  if (/^(\d)\1{5}$/.test(pin)) return true;
  const up = "0123456789012", down = "9876543210987";
  if (up.includes(pin) || down.includes(pin)) return true;
  if (pin.slice(0, 3) === pin.slice(3) || pin.slice(0, 2).repeat(3) === pin) return true;
  return false;
}

const ENTRY_KINDS = ["expense", "income", "transfer", "refund"];

function entryInput(b: Record<string, unknown>, partial: boolean) {
  const out: Record<string, unknown> = {};
  const has = (k: string) => !partial || k in b;
  if (has("kind")) {
    if (!ENTRY_KINDS.includes(b.kind as string)) throw bad("Pick expense, income, transfer or refund");
    out.kind = b.kind;
  }
  if (has("occurred_on")) {
    if (!isDate(b.occurred_on)) throw bad("Date is invalid");
    out.occurred_on = b.occurred_on;
  }
  if (has("amount")) out.amount = num(b.amount, "Amount");
  if (has("title")) out.title = str(b.title, 140, "What it was", true);
  for (const f of ["category_id", "account_id", "to_account_id"]) if (f in b) out[f] = optId(b[f], f);
  if ("one_time" in b) out.one_time = !!b.one_time;
  if ("flagged" in b) out.flagged = !!b.flagged;
  if ("note" in b) out.note = str(b.note, 1000, "Note");
  return out;
}

// ---------- handlers ----------
async function login(req: Request, b: Record<string, unknown>) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const email = (str(b.email, 200, "Email", true) as string).toLowerCase();
  const pin = String(b.pin ?? "");
  if (!/^\d{6}$/.test(pin)) throw new HttpError(400, "bad_pin", "Enter your 6-digit PIN");
  const { data, error } = await db.rpc("pin_login", { p_email: email, p_pin: pin, p_ip: ip });
  if (error) throw error;
  if (!data.ok) {
    const msg =
      data.error === "invalid"
        ? "That email and PIN don't match"
        : data.error === "locked"
        ? "Too many wrong PINs. Try again later."
        : "Too many attempts from this device. Try again in 15 minutes.";
    throw new HttpError(data.error === "invalid" ? 401 : 429, data.error, msg, data);
  }
  const { data: me } = await db.from("members").select(MEMBER_COLS).eq("id", data.member_id).single();
  return { token: await signToken(data.member_id, data.session_version), me: publicMember(me as Member) };
}

async function changePin(req: Request, me: Member, b: Record<string, unknown>) {
  const pin = String(b.pin ?? "");
  if (!/^\d{6}$/.test(pin)) throw new HttpError(400, "bad_pin", "Your PIN needs to be 6 digits");
  if (weakPin(pin)) throw new HttpError(400, "weak_pin", "That PIN is too easy to guess. Try another.");
  if (!me.must_change_pin) {
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
    const { data, error } = await db.rpc("pin_login", { p_email: me.email, p_pin: String(b.current ?? ""), p_ip: ip });
    if (error) throw error;
    if (!data.ok) throw new HttpError(401, "wrong_current", "Your current PIN isn't right", data);
  }
  const { data: v, error } = await db.rpc("set_pin", { p_member: me.id, p_pin: pin, p_temp: false });
  if (error) throw error;
  return { token: await signToken(me.id, v as number) };
}

async function getState(me: Member) {
  const [members, accounts, balances, categories, settings, checkins, newComments, newEntries] = await Promise.all([
    db.from("members").select("id,name,email,color,last_login_at").order("created_at"),
    db.from("accounts").select("*").order("sort"),
    db.from("balances").select("*").order("as_of", { ascending: false }).order("created_at", { ascending: false }).limit(2000),
    db.from("categories").select("*").order("sort"),
    db.from("settings").select("*"),
    db.from("checkins").select("*").order("created_at", { ascending: false }).limit(12),
    db.from("comments").select("id,entry_id").gt("created_at", me.feed_seen_at).or(`author_id.is.null,author_id.neq.${me.id}`),
    db.from("entries").select("id").is("deleted_at", null).gt("created_at", me.feed_seen_at)
      .or(`created_by.is.null,created_by.neq.${me.id}`),
  ]);
  for (const r of [members, accounts, balances, categories, settings, checkins, newComments, newEntries]) if (r.error) throw r.error;
  return {
    me: publicMember(me),
    members: members.data,
    accounts: accounts.data,
    balances: balances.data,
    categories: categories.data,
    settings: Object.fromEntries((settings.data ?? []).map((s) => [s.key, s.value])),
    checkins: checkins.data,
    unread: {
      entries: (newEntries.data ?? []).map((e) => e.id),
      comment_entries: [...new Set((newComments.data ?? []).map((c) => c.entry_id))],
      comments: (newComments.data ?? []).length,
    },
  };
}

function withCounts(rows: Record<string, unknown>[]) {
  return rows.map(({ comments, ...r }) => ({
    ...r,
    comment_count: Array.isArray(comments) ? (comments[0] as { count: number } | undefined)?.count ?? 0 : 0,
  }));
}

async function listEntries(url: URL) {
  const p = url.searchParams;
  let q = db.from("entries").select("*, comments(count)").is("deleted_at", null);
  if (p.get("from")) q = q.gte("occurred_on", optDate(p.get("from"), "from") as string);
  if (p.get("to")) q = q.lte("occurred_on", optDate(p.get("to"), "to") as string);
  const who = p.get("who");
  if (who === "claude") q = q.is("created_by", null);
  else if (who) q = q.eq("created_by", optId(who, "who") as string);
  if (p.get("flagged") === "1") q = q.eq("flagged", true);
  if (p.get("one_time") === "1") q = q.eq("one_time", true);
  if (p.get("unverified") === "1") q = q.eq("verified", false);
  if (p.get("category_id")) q = q.eq("category_id", optId(p.get("category_id"), "category") as string);
  if (p.get("account_id")) {
    const a = optId(p.get("account_id"), "account") as string;
    q = q.or(`account_id.eq.${a},to_account_id.eq.${a}`);
  }
  // PostgREST `or` filters treat these as syntax, so strip them from the search text.
  const search = (p.get("q") ?? "").trim().slice(0, 60).replace(/[%,()*"\\:]/g, " ").trim();
  if (search) q = q.or(`title.ilike.%${search}%,note.ilike.%${search}%`);
  const limit = Math.min(Number(p.get("limit") ?? 2000) || 2000, 2000);
  const offset = Math.max(Number(p.get("offset") ?? 0) || 0, 0);
  q = q.order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  const { data, error } = await q;
  if (error) throw error;
  return { entries: withCounts(data ?? []) };
}

async function getEntry(id: string) {
  const [e, c] = await Promise.all([
    db.from("entries").select("*").eq("id", id).maybeSingle(),
    db.from("comments").select("*").eq("entry_id", id).order("created_at"),
  ]);
  if (e.error) throw e.error;
  if (c.error) throw c.error;
  if (!e.data || e.data.deleted_at) throw new HttpError(404, "not_found", "That entry was deleted");
  return { entry: e.data, comments: c.data };
}

function checkTransfer(row: Record<string, unknown>) {
  if (row.kind === "transfer") {
    if (!row.account_id || !row.to_account_id) throw bad("A transfer needs a from and a to account");
    if (row.account_id === row.to_account_id) throw bad("Pick two different accounts");
  }
}

async function createEntry(me: Member, b: Record<string, unknown>) {
  const row = { ...entryInput(b, false), created_by: me.id, updated_by: me.id, source: "manual" };
  checkTransfer(row);
  const { data, error } = await db.from("entries").insert(row).select("*").single();
  if (error) throw error;
  return { entry: { ...data, comment_count: 0 } };
}

async function updateEntry(me: Member, id: string, b: Record<string, unknown>) {
  const patch = { ...entryInput(b, true), updated_by: me.id, updated_at: new Date().toISOString() };
  const { data: cur } = await db.from("entries").select("*").eq("id", id).maybeSingle();
  if (!cur || cur.deleted_at) throw new HttpError(404, "not_found", "That entry was deleted");
  checkTransfer({ ...cur, ...patch });
  const { data, error } = await db.from("entries").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return { entry: data };
}

async function deleteEntry(me: Member, id: string) {
  const { error } = await db.from("entries")
    .update({ deleted_at: new Date().toISOString(), updated_by: me.id }).eq("id", id);
  if (error) throw error;
  return { ok: true };
}

async function addComment(me: Member, entryId: string, b: Record<string, unknown>) {
  const body = str(b.body, 2000, "Comment", true);
  const { data, error } = await db.from("comments").insert({ entry_id: entryId, author_id: me.id, body }).select("*").single();
  if (error) throw error;
  return { comment: data };
}

async function deleteComment(me: Member, id: string) {
  const { data: c } = await db.from("comments").select("author_id").eq("id", id).maybeSingle();
  if (!c) return { ok: true };
  if (c.author_id !== me.id) throw new HttpError(403, "not_yours", "You can only delete your own comments");
  const { error } = await db.from("comments").delete().eq("id", id);
  if (error) throw error;
  return { ok: true };
}

async function addBalances(me: Member, b: Record<string, unknown>) {
  const asOf = optDate(b.as_of, "Date");
  if (!asOf) throw bad("Pick the date for these balances");
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length || items.length > 30) throw bad("Enter at least one balance");
  const rows = items.map((it: Record<string, unknown>) => ({
    account_id: optId(it.account_id, "account"),
    amount: num(it.amount, "Balance", { allowZero: true }),
    note: str(it.note, 300, "Note"),
    as_of: asOf,
    created_by: me.id,
    source: "manual",
  }));
  if (rows.some((r) => !r.account_id)) throw bad("Each balance needs an account");
  const { data, error } = await db.from("balances").insert(rows).select("*");
  if (error) throw error;
  return { balances: data };
}

async function deleteBalance(id: string) {
  const { error } = await db.from("balances").delete().eq("id", id);
  if (error) throw error;
  return { ok: true };
}

const ACCOUNT_KINDS = ["checking", "savings", "credit", "loan", "cash"];
function accountInput(b: Record<string, unknown>, partial: boolean) {
  const out: Record<string, unknown> = {};
  const has = (k: string) => !partial || k in b;
  if (has("name")) out.name = str(b.name, 60, "Name", true);
  if (has("kind")) {
    if (!ACCOUNT_KINDS.includes(b.kind as string)) throw bad("Pick an account type");
    out.kind = b.kind;
  }
  for (const f of ["institution", "holder"]) if (f in b) out[f] = str(b[f], 60, f);
  for (const f of ["apr", "promo_apr", "plan_payment", "min_payment", "starting_balance"]) if (f in b) out[f] = optNum(b[f], f);
  if ("promo_end" in b) out.promo_end = optDate(b.promo_end, "Promo end");
  if ("sort" in b) out.sort = Math.trunc(Number(b.sort) || 0);
  if ("archived" in b) out.archived = !!b.archived;
  return out;
}

const CATEGORY_KINDS = ["bill", "spending", "debt", "income", "other", "business"];
function categoryInput(b: Record<string, unknown>, partial: boolean) {
  const out: Record<string, unknown> = {};
  const has = (k: string) => !partial || k in b;
  if (has("name")) out.name = str(b.name, 60, "Name", true);
  if (has("grp")) out.grp = str(b.grp, 60, "Group", true);
  if (has("kind")) {
    if (!CATEGORY_KINDS.includes(b.kind as string)) throw bad("Pick a category type");
    out.kind = b.kind;
  }
  if ("monthly_plan" in b) out.monthly_plan = num(b.monthly_plan ?? 0, "Monthly plan", { allowZero: true });
  if ("due_day" in b) {
    const d = b.due_day === null || b.due_day === "" ? null : Math.trunc(Number(b.due_day));
    if (d !== null && !(d >= 1 && d <= 31)) throw bad("Due day must be 1 to 31");
    out.due_day = d;
  }
  if ("icon" in b) out.icon = str(b.icon, 40, "Icon");
  if ("sort" in b) out.sort = Math.trunc(Number(b.sort) || 0);
  if ("archived" in b) out.archived = !!b.archived;
  return out;
}

const SETTING_KEYS = ["pay_anchor", "pay_every_days", "typical_check", "cushion_target"];

async function updateMember(me: Member, id: string, b: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  if ("name" in b) patch.name = str(b.name, 40, "Name", true);
  if ("color" in b) {
    if (typeof b.color !== "string" || !/^#[0-9a-f]{6}$/i.test(b.color)) throw bad("Pick a color");
    patch.color = b.color;
  }
  if ("email" in b) {
    const email = (str(b.email, 200, "Email", true) as string).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad("That email doesn't look right");
    patch.email = email;
  }
  const { data, error } = await db.from("members").update(patch).eq("id", id).select("id,name,email,color").single();
  if (error) throw error.code === "23505" ? bad("Someone already uses that email") : error;
  return { member: data, me: id === me.id };
}

async function resetPin(me: Member, id: string) {
  if (id === me.id) throw bad("Use Change PIN for your own PIN");
  let pin = "";
  do {
    const n = new Uint32Array(1);
    crypto.getRandomValues(n);
    pin = String(n[0] % 1_000_000).padStart(6, "0");
  } while (weakPin(pin));
  const { error } = await db.rpc("set_pin", { p_member: id, p_pin: pin, p_temp: true });
  if (error) throw error;
  return { pin };
}

// ---------- router ----------
function cors(origin: string | null): Record<string, string> {
  const ok = origin && (ORIGINS.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
  return {
    "Access-Control-Allow-Origin": ok ? origin! : ORIGINS[0] ?? "*",
    "Access-Control-Allow-Headers": "content-type, x-session",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    "Access-Control-Expose-Headers": "x-session-refresh",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

async function route(req: Request, path: string, url: URL): Promise<unknown> {
  const m = req.method;
  const body = async () => {
    if (m === "GET" || m === "DELETE") return {};
    try {
      const j = await req.json();
      return j && typeof j === "object" ? (j as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  };

  if (path === "/health") {
    // Touches the database so the daily ping counts as activity (free projects pause after a quiet week).
    const { error } = await db.from("settings").select("key").limit(1);
    return { ok: !error };
  }
  if (path === "/auth/login" && m === "POST") return await login(req, await body());

  const { me, refresh } = await requireMember(req);
  const reply = async (p: Promise<unknown> | unknown) => ({ __refresh: refresh, data: await p });

  if (path === "/auth/pin" && m === "POST") return reply(changePin(req, me, await body()));
  if (path === "/auth/logout-all" && m === "POST") {
    await db.from("members").update({ session_version: me.session_version + 1 }).eq("id", me.id);
    return reply({ ok: true });
  }
  if (me.must_change_pin) throw new HttpError(403, "must_change_pin", "Set your own PIN first");

  if (path === "/state" && m === "GET") return reply(getState(me));
  if (path === "/seen" && m === "POST") {
    await db.from("members").update({ feed_seen_at: new Date().toISOString() }).eq("id", me.id);
    return reply({ ok: true });
  }
  if (path === "/entries" && m === "GET") return reply(listEntries(url));
  if (path === "/entries" && m === "POST") return reply(createEntry(me, await body()));

  let r = path.match(/^\/entries\/([0-9a-f-]{36})$/i);
  if (r && m === "GET") return reply(getEntry(r[1]));
  if (r && m === "PATCH") return reply(updateEntry(me, r[1], await body()));
  if (r && m === "DELETE") return reply(deleteEntry(me, r[1]));
  r = path.match(/^\/entries\/([0-9a-f-]{36})\/comments$/i);
  if (r && m === "POST") return reply(addComment(me, r[1], await body()));
  r = path.match(/^\/comments\/([0-9a-f-]{36})$/i);
  if (r && m === "DELETE") return reply(deleteComment(me, r[1]));

  if (path === "/balances" && m === "POST") return reply(addBalances(me, await body()));
  r = path.match(/^\/balances\/([0-9a-f-]{36})$/i);
  if (r && m === "DELETE") return reply(deleteBalance(r[1]));

  if (path === "/accounts" && m === "POST") {
    const row = accountInput(await body(), false);
    const { data, error } = await db.from("accounts").insert(row).select("*").single();
    if (error) throw error;
    return reply({ account: data });
  }
  r = path.match(/^\/accounts\/([0-9a-f-]{36})$/i);
  if (r && m === "PATCH") {
    const { data, error } = await db.from("accounts").update(accountInput(await body(), true)).eq("id", r[1]).select("*").single();
    if (error) throw error;
    return reply({ account: data });
  }

  if (path === "/categories" && m === "POST") {
    const { data, error } = await db.from("categories").insert(categoryInput(await body(), false)).select("*").single();
    if (error) throw error.code === "23505" ? bad("There's already a category with that name") : error;
    return reply({ category: data });
  }
  r = path.match(/^\/categories\/([0-9a-f-]{36})$/i);
  if (r && m === "PATCH") {
    const { data, error } = await db.from("categories").update(categoryInput(await body(), true)).eq("id", r[1]).select("*").single();
    if (error) throw error.code === "23505" ? bad("There's already a category with that name") : error;
    return reply({ category: data });
  }

  r = path.match(/^\/settings\/([a-z_]+)$/);
  if (r && m === "PUT") {
    if (!SETTING_KEYS.includes(r[1])) throw bad("Unknown setting");
    const b = await body();
    if (JSON.stringify(b.value ?? null).length > 2000) throw bad("Setting is too large");
    const { error } = await db.from("settings").upsert({ key: r[1], value: b.value ?? null });
    if (error) throw error;
    return reply({ ok: true });
  }

  r = path.match(/^\/members\/([0-9a-f-]{36})$/i);
  if (r && m === "PATCH") return reply(updateMember(me, r[1], await body()));
  r = path.match(/^\/members\/([0-9a-f-]{36})\/reset-pin$/i);
  if (r && m === "POST") return reply(resetPin(me, r[1]));

  throw new HttpError(404, "not_found", "Not found");
}

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get("origin")), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*?\/api(?=\/|$)/, "") || "/";
  try {
    const out = (await route(req, path, url)) as Record<string, unknown>;
    if (out && "__refresh" in out) {
      const h: Record<string, string> = { ...headers };
      if (out.__refresh) h["x-session-refresh"] = out.__refresh as string;
      return new Response(JSON.stringify(out.data), { status: 200, headers: h });
    }
    return new Response(JSON.stringify(out), { status: 200, headers });
  } catch (e) {
    if (e instanceof HttpError) {
      return new Response(JSON.stringify({ ...(e.extra ?? {}), error: e.code, message: e.message }), {
        status: e.status,
        headers,
      });
    }
    console.error(e);
    const message = (e as { message?: string })?.message ?? String(e);
    return new Response(JSON.stringify({ error: "server", message }), { status: 500, headers });
  }
});
