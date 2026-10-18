import type { Account, Balance, Category, Entry } from "./types";
import { daysBetween } from "./format";

export const CLAUDE = "claude";

export type Payday = { day: string; amount: number; logged: boolean };

export type MonthSummary = {
  /** net spent per category: expenses minus refunds, every expense counts */
  byCategory: Map<string, number>;
  dailyCats: Category[];
  billCats: Category[];
  /** the agreed spending money: sum of the day-to-day plan */
  spendBudget: number;
  /** spent against it: day-to-day categories plus anything unplanned */
  spendSpent: number;
  unplanned: { category: Category | null; amount: number }[];
  unplannedTotal: number;
  billsPlan: number;
  billsPaid: number;
  /** what bills will cost this month: the plan, or more if more was paid */
  billsTotal: number;
  debtPlan: number;
  debtPaid: Map<string, number>;
  debtPaidTotal: number;
  debtTotal: number;
  interest: number;
  pay: Payday[];
  payTotal: number;
  payLogged: number;
  otherIn: Entry[];
  otherInTotal: number;
  /** pay + other money in − bills − debt payments − spending */
  leftOver: number;
  business: number;
  loggedBy: Map<string, number>;
  claudeAdded: number;
  matched: number;
  manualTotal: number;
  manualMatched: number;
  count: number;
};

const isPaycheck = (c: Category | undefined) => !!c && c.kind === "income" && c.name.toLowerCase().includes("paycheck");

/**
 * The month, counted the way a household budget should:
 * - Every expense comes off the money you agreed to spend. Day-to-day categories have their own
 *   amounts; spending in any other category (trips, one-offs, a $0 category) is "unplanned".
 * - Bills and debt payments are planned amounts, replaced by what was actually paid when that's more.
 * - Pay: each payday counts as the usual check until a paycheck is logged near it.
 * - Transfers between your own accounts aren't spending. Paying a card is a debt payment.
 * - Red Water (business) costs are left out entirely.
 */
export function summarizeMonth(
  entries: Entry[],
  categories: Category[],
  accounts: Account[],
  paydays: string[],
  typicalCheck: number
): MonthSummary {
  const cat = new Map(categories.map((c) => [c.id, c]));
  const acct = new Map(accounts.map((a) => [a.id, a]));
  const byCategory = new Map<string, number>();
  const debtPaid = new Map<string, number>();
  const loggedBy = new Map<string, number>();
  const unplannedMap = new Map<string, number>();
  const paychecks: Entry[] = [];
  const otherIn: Entry[] = [];
  let interest = 0, business = 0;
  let claudeAdded = 0, matched = 0, manualTotal = 0, manualMatched = 0;

  for (const e of entries) {
    const c = e.category_id ? cat.get(e.category_id) : undefined;
    const amt = Number(e.amount);
    loggedBy.set(e.created_by ?? CLAUDE, (loggedBy.get(e.created_by ?? CLAUDE) ?? 0) + 1);
    if (!e.created_by) claudeAdded++;
    if (e.verified) matched++;
    if (e.created_by) {
      manualTotal++;
      if (e.verified) manualMatched++;
    }

    if (c?.kind === "business") {
      business += e.kind === "expense" ? amt : e.kind === "transfer" ? 0 : -amt;
      continue;
    }
    if (e.kind === "income") {
      if (isPaycheck(c)) paychecks.push(e);
      else otherIn.push(e);
      continue;
    }
    if (e.kind === "transfer") {
      const to = e.to_account_id ? acct.get(e.to_account_id) : undefined;
      if (to && (to.kind === "credit" || to.kind === "loan")) debtPaid.set(to.id, (debtPaid.get(to.id) ?? 0) + amt);
      continue;
    }
    const signed = e.kind === "refund" ? -amt : amt;
    if (c?.kind === "debt") {
      interest += signed; // interest goes onto the card, it isn't cash spent
      continue;
    }
    if (c) byCategory.set(c.id, (byCategory.get(c.id) ?? 0) + signed);
    if (!c || (c.kind !== "spending" && c.kind !== "bill")) {
      const k = c?.id ?? "none";
      unplannedMap.set(k, (unplannedMap.get(k) ?? 0) + signed);
    }
  }

  const live = categories.filter((c) => !c.archived);
  const billCats = live.filter((c) => c.kind === "bill");
  const dailyCats = live.filter((c) => c.kind === "spending");
  const debtAccounts = accounts.filter((a) => !a.archived && (a.kind === "credit" || a.kind === "loan"));

  const spent = (c: Category) => byCategory.get(c.id) ?? 0;
  const plan = (c: Category) => Number(c.monthly_plan);
  const unplanned = [...unplannedMap.entries()]
    .filter(([, v]) => Math.abs(v) > 0.004)
    .map(([k, amount]) => ({ category: k === "none" ? null : cat.get(k) ?? null, amount }));
  const unplannedTotal = unplanned.reduce((s, u) => s + u.amount, 0);
  const spendBudget = dailyCats.reduce((s, c) => s + plan(c), 0);
  const spendSpent = dailyCats.reduce((s, c) => s + spent(c), 0) + unplannedTotal;
  const spendTotal = dailyCats.reduce((s, c) => s + Math.max(plan(c), spent(c)), 0) + Math.max(0, unplannedTotal);

  const billsPlan = billCats.reduce((s, c) => s + plan(c), 0);
  const billsPaid = billCats.reduce((s, c) => s + spent(c), 0);
  const billsTotal = billCats.reduce((s, c) => s + Math.max(plan(c), spent(c)), 0);

  const debtPlan = debtAccounts.reduce((s, a) => s + Number(a.plan_payment ?? 0), 0);
  const debtPaidTotal = [...debtPaid.values()].reduce((s, v) => s + v, 0);
  const debtTotal = debtAccounts.reduce((s, a) => s + Math.max(Number(a.plan_payment ?? 0), debtPaid.get(a.id) ?? 0), 0);

  // Paydays: a logged paycheck within 4 days stands in for that payday; otherwise expect the usual check.
  const used = new Set<string>();
  const pay: Payday[] = paydays.map((day) => {
    const hit = paychecks
      .filter((p) => !used.has(p.id) && Math.abs(daysBetween(day, p.occurred_on)) <= 4)
      .sort((a, b) => Math.abs(daysBetween(day, a.occurred_on)) - Math.abs(daysBetween(day, b.occurred_on)))[0];
    if (hit) {
      used.add(hit.id);
      return { day, amount: Number(hit.amount), logged: true };
    }
    return { day, amount: typicalCheck, logged: false };
  });
  for (const p of paychecks) if (!used.has(p.id)) pay.push({ day: p.occurred_on, amount: Number(p.amount), logged: true });
  pay.sort((a, b) => a.day.localeCompare(b.day));
  const payTotal = pay.reduce((s, p) => s + p.amount, 0);
  const otherInTotal = otherIn.reduce((s, e) => s + Number(e.amount), 0);

  return {
    byCategory,
    dailyCats,
    billCats,
    spendBudget,
    spendSpent,
    unplanned,
    unplannedTotal,
    billsPlan,
    billsPaid,
    billsTotal,
    debtPlan,
    debtPaid,
    debtPaidTotal,
    debtTotal,
    interest,
    pay,
    payTotal,
    payLogged: pay.filter((p) => p.logged).length,
    otherIn,
    otherInTotal,
    leftOver: payTotal + otherInTotal - billsTotal - debtTotal - spendTotal,
    business,
    loggedBy,
    claudeAdded,
    matched,
    manualTotal,
    manualMatched,
    count: entries.length,
  };
}

/** Latest balance per account (balances arrive newest first). */
export function latestBalances(balances: Balance[]) {
  const out = new Map<string, Balance>();
  for (const b of balances) if (!out.has(b.account_id)) out.set(b.account_id, b);
  return out;
}

export function previousBalance(balances: Balance[], accountId: string) {
  let seen = 0;
  for (const b of balances) {
    if (b.account_id !== accountId) continue;
    if (++seen === 2) return b;
  }
  return undefined;
}

export const isDebt = (a: Account) => a.kind === "credit" || a.kind === "loan";

export function planPerPaycheck(monthly: number) {
  return (monthly * 12) / 26;
}
