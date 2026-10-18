import type { Account, Balance, Category, Entry } from "./types";

export type MonthSummary = {
  byCategory: Map<string, number>;
  billsPlan: number;
  billsSpent: number;
  billCats: Category[];
  dailyPlan: number;
  dailySpent: number;
  dailyCats: Category[];
  otherSpent: number;
  oneTime: Entry[];
  oneTimeTotal: number;
  income: number;
  paychecks: Entry[];
  debtPaid: Map<string, number>;
  debtPaidTotal: number;
  debtPlan: number;
  interest: number;
  business: number;
  loggedBy: Map<string, number>;
  claudeAdded: number;
  matched: number;
  manualTotal: number;
  manualMatched: number;
  count: number;
};

export const CLAUDE = "claude";

/**
 * How entries count toward the plan:
 * - expense: spending in its category, unless it's one-time (shown separately) or business (excluded).
 * - refund: comes back off its category.
 * - income: money in (business income excluded).
 * - transfer to a credit/loan account: a debt payment. Other transfers are just moving money.
 */
export function summarizeMonth(entries: Entry[], categories: Category[], accounts: Account[]): MonthSummary {
  const cat = new Map(categories.map((c) => [c.id, c]));
  const acct = new Map(accounts.map((a) => [a.id, a]));
  const byCategory = new Map<string, number>();
  const debtPaid = new Map<string, number>();
  const loggedBy = new Map<string, number>();
  const oneTime: Entry[] = [];
  const paychecks: Entry[] = [];
  let otherSpent = 0, oneTimeTotal = 0, income = 0, interest = 0, business = 0;
  let claudeAdded = 0, matched = 0, manualTotal = 0, manualMatched = 0;

  for (const e of entries) {
    const c = e.category_id ? cat.get(e.category_id) : undefined;
    const amt = Number(e.amount);
    const who = e.created_by ?? CLAUDE;
    loggedBy.set(who, (loggedBy.get(who) ?? 0) + 1);
    if (!e.created_by) claudeAdded++;
    if (e.verified) matched++;
    if (e.created_by) {
      manualTotal++;
      if (e.verified) manualMatched++;
    }

    if (c?.kind === "business") {
      business += e.kind === "income" || e.kind === "refund" ? -amt : e.kind === "expense" ? amt : 0;
      continue;
    }
    if (e.kind === "income") {
      income += amt;
      if (c?.name.toLowerCase().includes("paycheck")) paychecks.push(e);
      continue;
    }
    if (e.kind === "transfer") {
      const to = e.to_account_id ? acct.get(e.to_account_id) : undefined;
      if (to && (to.kind === "credit" || to.kind === "loan")) debtPaid.set(to.id, (debtPaid.get(to.id) ?? 0) + amt);
      continue;
    }
    const signed = e.kind === "refund" ? -amt : amt;
    if (e.one_time) {
      oneTime.push(e);
      oneTimeTotal += signed;
      continue;
    }
    if (c?.kind === "debt") {
      interest += signed;
      continue;
    }
    if (c && (c.kind === "bill" || c.kind === "spending")) {
      byCategory.set(c.id, (byCategory.get(c.id) ?? 0) + signed);
    } else {
      otherSpent += signed;
      if (c) byCategory.set(c.id, (byCategory.get(c.id) ?? 0) + signed);
    }
  }

  const live = categories.filter((c) => !c.archived);
  const billCats = live.filter((c) => c.kind === "bill");
  const dailyCats = live.filter((c) => c.kind === "spending");
  const sum = (cs: Category[], f: (c: Category) => number) => cs.reduce((s, c) => s + f(c), 0);
  const debtAccounts = accounts.filter((a) => !a.archived && (a.kind === "credit" || a.kind === "loan"));

  return {
    byCategory,
    billsPlan: sum(billCats, (c) => Number(c.monthly_plan)),
    billsSpent: sum(billCats, (c) => byCategory.get(c.id) ?? 0),
    billCats,
    dailyPlan: sum(dailyCats, (c) => Number(c.monthly_plan)),
    dailySpent: sum(dailyCats, (c) => byCategory.get(c.id) ?? 0),
    dailyCats,
    otherSpent,
    oneTime,
    oneTimeTotal,
    income,
    paychecks,
    debtPaid,
    debtPaidTotal: [...debtPaid.values()].reduce((s, v) => s + v, 0),
    debtPlan: debtAccounts.reduce((s, a) => s + Number(a.plan_payment ?? 0), 0),
    interest,
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
