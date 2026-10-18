const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** $1,234.56 — or $1,235 with whole: true. */
export function money(n: number | null | undefined, opts: { whole?: boolean; sign?: boolean } = {}) {
  const v = Number(n ?? 0);
  const s = (opts.whole ? usd0 : usd).format(Math.abs(v));
  if (opts.sign) return (v < 0 ? "−" : "+") + s;
  return v < 0 ? "−" + s : s;
}

export const pad = (n: number) => String(n).padStart(2, "0");

export function parseDay(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isoDay(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const today = () => isoDay(new Date());
export const ymOf = (day: string) => day.slice(0, 7);
export const thisMonth = () => ymOf(today());

export function addDays(day: string, n: number) {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return isoDay(d);
}

export function daysBetween(a: string, b: string) {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400000);
}

export function addMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function monthBounds(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${pad(last)}`, days: last };
}

export function monthLabel(ym: string, short = false) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", short ? { month: "short" } : { month: "long", year: "numeric" });
}

export function shortDate(day: string, withYear = false) {
  return parseDay(day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

export function dayLabel(day: string) {
  const t = today();
  if (day === t) return "Today";
  if (day === addDays(t, -1)) return "Yesterday";
  const d = parseDay(day);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function relTime(iso: string) {
  const t = new Date(iso);
  const s = (Date.now() - t.getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const day = isoDay(t);
  if (day === addDays(today(), -1)) return "yesterday";
  if (s < 6 * 86400) return t.toLocaleDateString("en-US", { weekday: "long" });
  return shortDate(day, t.getFullYear() !== new Date().getFullYear());
}

export function timeOfDay(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Paydays from an anchor Monday, every N days, within [from, to]. */
export function paydays(anchor: string | undefined, every: number | undefined, from: string, to: string) {
  if (!anchor) return [];
  const step = every && every > 0 ? every : 14;
  const out: string[] = [];
  let k = Math.floor(daysBetween(anchor, from) / step);
  for (let i = 0; i < 40; i++, k++) {
    const d = addDays(anchor, k * step);
    if (d > to) break;
    if (d >= from) out.push(d);
  }
  return out;
}

export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

export function parseAmount(s: string) {
  const n = Number(String(s).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
