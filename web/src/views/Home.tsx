import { useMemo, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, CircleCheck, Plus, RefreshCw } from "lucide-react";
import { useEntries, useStore } from "../lib/store";
import { isDebt, summarizeMonth, CLAUDE, type MonthSummary } from "../lib/budget";
import {
  addMonths, daysBetween, money, monthBounds, monthLabel, ordinal, parseDay, paydays, relTime, shortDate, thisMonth, today,
} from "../lib/format";
import { Avatar, Button, Card, CategoryIcon, Money, Progress, SectionTitle, Spinner } from "../components/ui";
import type { Category } from "../lib/types";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function Home() {
  const { state, latest, members, openSheet } = useStore();
  const [ym, setYm] = useState(thisMonth());
  const { from, to, days } = monthBounds(ym);
  const { entries, error } = useEntries(`from=${from}&to=${to}`);
  const check = Number(state.settings.typical_check ?? 0);
  const payKey = paydays(state.settings.pay_anchor, state.settings.pay_every_days, from, to).join(",");
  const s = useMemo(
    () => (entries ? summarizeMonth(entries, state.categories, state.accounts, payKey ? payKey.split(",") : [], check) : null),
    [entries, state.categories, state.accounts, payKey, check]
  );
  const t = today();
  const isCurrent = ym === thisMonth();
  const isFuture = ym > thisMonth();
  const daysLeft = isCurrent ? days - parseDay(t).getDate() + 1 : isFuture ? days : 0;
  const checkin = state.checkins.find((c) => c.period === ym);
  const nextPay = paydays(state.settings.pay_anchor, state.settings.pay_every_days, t, monthBounds(addMonths(thisMonth(), 2)).to)[0];

  const cash = state.accounts.filter((a) => !a.archived && !isDebt(a));
  const debts = state.accounts.filter((a) => !a.archived && isDebt(a));
  const cashTotal = cash.reduce((sum, a) => sum + Number(latest.get(a.id)?.amount ?? 0), 0);
  const staleCash = cash.some((a) => {
    const b = latest.get(a.id);
    return !b || daysBetween(b.as_of, t) > 7;
  });

  const left = s ? s.spendBudget - s.spendSpent : 0;
  const month = monthLabel(ym, true);

  return (
    <div className="pb-8">
      <div className="flex items-center justify-between pt-2">
        <div>
          <p className="text-sm text-muted">
            {greeting()}, {state.me.name}
          </p>
          <h1 className="font-display text-[28px] leading-tight font-semibold tracking-tight">{monthLabel(ym)}</h1>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setYm(addMonths(ym, -1))} className="flex size-10 items-center justify-center rounded-full hover:bg-surface-2" aria-label="Previous month">
            <ChevronLeft className="size-5" />
          </button>
          {!isCurrent ? (
            <button onClick={() => setYm(thisMonth())} className="h-8 rounded-full bg-surface-2 px-3 text-sm font-medium">
              Today
            </button>
          ) : null}
          <button onClick={() => setYm(addMonths(ym, 1))} className="flex size-10 items-center justify-center rounded-full hover:bg-surface-2" aria-label="Next month">
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>

      {error ? <p className="mt-4 rounded-xl bg-bad-soft p-3 text-sm text-bad">{error}</p> : null}

      {!s ? (
        <div className="flex justify-center py-24 text-muted">
          <Spinner />
        </div>
      ) : (
        <>
          {/* Hero: what's left of the money you agreed to spend */}
          <div className="relative mt-4 overflow-hidden rounded-3xl bg-[#1f5c4d] p-5 text-white shadow-card">
            <div className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-white/[0.06]" />
            <p className="text-sm font-medium text-white/75">
              {left >= 0 ? `Left to spend in ${month}` : `Over the spending budget in ${month}`}
            </p>
            <p className={`num mt-1 font-display text-[44px] leading-none font-semibold tracking-tight ${left < 0 ? "text-[#F6B4A3]" : ""}`}>
              {money(Math.abs(left), { whole: Math.abs(left) >= 1000 })}
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/20">
              <div
                className={`h-full rounded-full ${left < 0 ? "bg-[#F2A48F]" : "bg-[#E8B649]"}`}
                style={{ width: `${Math.min(100, s.spendBudget ? (s.spendSpent / s.spendBudget) * 100 : 100)}%` }}
              />
            </div>
            <div className="mt-2.5 flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm text-white/80">
              <span className="num">
                {money(s.spendSpent)} spent of {money(s.spendBudget, { whole: true })} agreed
              </span>
              {daysLeft && left > 0 ? (
                <span className="num">
                  {daysLeft} days left · about {money(left / daysLeft, { whole: true })}/day
                </span>
              ) : null}
            </div>
          </div>

          <MonthMoney s={s} month={month} check={check} onLogPay={() => openSheet({ type: "add", tab: "income" })} />

          {nextPay && (isCurrent || isFuture) ? (
            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-card">
              <span className="flex size-9 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <CalendarDays className="size-5" />
              </span>
              <span className="flex-1 text-sm">
                <span className="font-semibold">Next payday {shortDate(nextPay)}</span>
                <span className="block text-muted">
                  {daysBetween(t, nextPay) === 0 ? "Today" : daysBetween(t, nextPay) === 1 ? "Tomorrow" : `In ${daysBetween(t, nextPay)} days`}
                  {check ? ` · expecting ${money(check, { whole: true })}` : ""}
                </span>
              </span>
              <Button size="sm" variant="soft" onClick={() => openSheet({ type: "add", tab: "income" })}>
                Log it
              </Button>
            </div>
          ) : null}

          {checkin ? (
            <>
              <SectionTitle>Claude's notes</SectionTitle>
              <Card className="p-4">
                <div className="flex items-center gap-2.5">
                  <Avatar who="claude" size={28} />
                  <div className="font-semibold">{checkin.title}</div>
                  <span className="ml-auto text-xs text-muted">{relTime(checkin.created_at)}</span>
                </div>
                <p className="mt-2.5 text-[15px] leading-relaxed whitespace-pre-line text-ink-2">{checkin.body}</p>
              </Card>
            </>
          ) : null}

          <SectionTitle action={<a href={`#/feed?month=${ym}`} className="text-sm font-medium text-brand">See all</a>}>
            Spending money, by category
          </SectionTitle>
          <Card className="divide-y divide-line">
            {s.dailyCats.map((c) => (
              <CategoryLine key={c.id} c={c} spent={s.byCategory.get(c.id) ?? 0} ym={ym} />
            ))}
            {s.unplanned.map((u) => (
              <a
                key={u.category?.id ?? "none"}
                href={u.category ? `#/feed?category=${u.category.id}&month=${ym}` : `#/feed?month=${ym}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2"
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-warn-soft text-warn">
                  <CategoryIcon icon={u.category?.icon ?? "tag"} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{u.category?.name ?? "Uncategorized"}</span>
                  <span className="block text-[13px] text-muted">Not in the plan</span>
                </span>
                <Money value={u.amount} className="font-semibold text-bad" />
              </a>
            ))}
          </Card>

          <SectionTitle>
            Bills · {money(s.billsPaid, { whole: true })} paid of {money(s.billsPlan, { whole: true })}
          </SectionTitle>
          <Card className="divide-y divide-line">
            {s.billCats.map((c) => (
              <BillLine
                key={c.id}
                c={c}
                paid={s.byCategory.get(c.id) ?? 0}
                ym={ym}
                onPaid={() =>
                  openSheet({ type: "add", tab: "expense", preset: { category_id: c.id, amount: Number(c.monthly_plan), title: c.name } })
                }
              />
            ))}
          </Card>

          <SectionTitle action={<a href="#/accounts" className="text-sm font-medium text-brand">Accounts</a>}>
            Debt payments · {money(s.debtPaidTotal, { whole: true })} paid of {money(s.debtPlan, { whole: true })}
          </SectionTitle>
          <Card className="divide-y divide-line">
            {debts.map((a) => {
              const bal = latest.get(a.id);
              const paid = s.debtPaid.get(a.id) ?? 0;
              const plan = Number(a.plan_payment ?? 0);
              return (
                <button key={a.id} onClick={() => openSheet({ type: "account", id: a.id })} className="block w-full px-4 py-3 text-left hover:bg-surface-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{a.name}</span>
                    <span className="num text-sm text-muted">owe {bal ? money(Number(bal.amount), { whole: true }) : "—"}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex-1">
                      <Progress value={paid} max={plan} tone={paid >= plan && plan > 0 ? "good" : "brand"} />
                    </div>
                    <span className={`num shrink-0 text-[13px] ${paid >= plan && plan > 0 ? "text-good" : "text-muted"}`}>
                      {paid >= plan && plan > 0 ? <Check className="mr-0.5 inline size-3.5" /> : null}
                      {money(paid, { whole: true })} of {money(plan, { whole: true })}
                    </span>
                  </div>
                </button>
              );
            })}
            {s.interest > 0 ? (
              <div className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-muted">Interest the cards charged this month</span>
                <Money value={s.interest} className="font-semibold text-bad" />
              </div>
            ) : null}
          </Card>

          <SectionTitle
            action={
              <button onClick={() => openSheet({ type: "add", tab: "balances" })} className="inline-flex items-center gap-1 text-sm font-medium text-brand">
                <RefreshCw className="size-3.5" /> Update
              </button>
            }
          >
            In your accounts now
          </SectionTitle>
          <Card className="p-4">
            <div className="flex items-end justify-between gap-3">
              <Money value={cashTotal} className="font-display text-3xl font-semibold tracking-tight" />
              {staleCash ? (
                <button onClick={() => openSheet({ type: "add", tab: "balances" })} className="rounded-full bg-warn-soft px-2.5 py-1 text-xs font-semibold text-warn">
                  Type in today's balances
                </button>
              ) : null}
            </div>
            <div className="mt-3 space-y-1.5">
              {cash.map((a) => {
                const b = latest.get(a.id);
                return (
                  <div key={a.id} className="flex items-center justify-between text-sm">
                    <span className="text-ink-2">{a.name}</span>
                    <span className="num">
                      {b ? money(Number(b.amount)) : <span className="text-muted">not entered</span>}
                      {b ? <span className="ml-2 text-xs text-muted">{shortDate(b.as_of)}</span> : null}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          {s.count ? (
            <>
              <SectionTitle>Who logged what</SectionTitle>
              <Card className="p-4">
                <div className="flex flex-wrap gap-x-5 gap-y-3">
                  {[...state.members.map((m) => m.id), CLAUDE].map((id) => {
                    const n = s.loggedBy.get(id) ?? 0;
                    const who = id === CLAUDE ? ("claude" as const) : members.get(id);
                    return (
                      <div key={id} className="flex items-center gap-2">
                        <Avatar who={who} size={28} />
                        <div className="text-sm leading-tight">
                          <div className="num font-semibold">{n}</div>
                          <div className="text-muted">{id === CLAUDE ? "added by Claude" : `by ${members.get(id)?.name}`}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 flex items-start gap-2 border-t border-line pt-3 text-sm text-ink-2">
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-good" />
                  {s.matched
                    ? `${s.matched} of ${s.count} entries are matched to a bank or card statement.`
                    : "When the statements come in, Claude matches them to what you logged and adds anything missing."}
                </p>
                {s.business > 0 ? (
                  <p className="mt-2 text-sm text-muted">Red Water costs on personal cards: {money(s.business)} (not counted).</p>
                ) : null}
              </Card>
            </>
          ) : null}

          <div className="mt-8 flex justify-center">
            <Button variant="outline" onClick={() => openSheet({ type: "add", tab: "expense" })}>
              <Plus className="size-4" /> Log something
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** The month's money from the paychecks: what comes in, what the plan sends out, what's left. */
function MonthMoney({ s, month, check, onLogPay }: { s: MonthSummary; month: string; check: number; onLogPay: () => void }) {
  const [open, setOpen] = useState(false);
  const short = s.leftOver < 0;
  const unloggedPays = s.pay.filter((p) => !p.logged).length;
  const row = (label: string, value: number, sub: string, sign: "+" | "−", tone = "") => (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        <div className="text-[13px] text-muted">{sub}</div>
      </div>
      <span className={`num shrink-0 font-semibold ${tone}`}>
        {sign}
        {money(value, { whole: Math.abs(value) >= 1000 })}
      </span>
    </div>
  );
  return (
    <Card className="mt-3 p-4">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={open}>
        <span>
          <span className="block text-[13px] font-medium text-muted">
            {month}'s money{check ? ` at ${money(check, { whole: true })} a paycheck` : ""}
          </span>
          <span className={`num font-display text-2xl font-semibold tracking-tight ${short ? "text-bad" : "text-good"}`}>
            {short ? "Short " : "Left over "}
            {money(Math.abs(s.leftOver), { whole: true })}
          </span>
        </span>
        <span className="shrink-0 text-sm font-medium text-brand">{open ? "Hide" : "How?"}</span>
      </button>
      {open ? (
        <div className="mt-2 divide-y divide-line border-t border-line text-[15px]">
          {row(
            "Pay",
            s.payTotal,
            s.pay.length
              ? s.pay.map((p) => `${shortDate(p.day)} ${money(p.amount, { whole: true })}${p.logged ? "" : " expected"}`).join(" · ")
              : "No paydays this month",
            "+",
            "text-good"
          )}
          {s.otherInTotal ? row("Other money in", s.otherInTotal, s.otherIn.map((e) => e.title).join(", "), "+", "text-good") : null}
          {row("Bills", s.billsTotal, `${money(s.billsPaid, { whole: true })} paid so far · plan ${money(s.billsPlan, { whole: true })}`, "−")}
          {row("Debt payments", s.debtTotal, `${money(s.debtPaidTotal, { whole: true })} paid so far · plan ${money(s.debtPlan, { whole: true })}`, "−")}
          {row("Spending money", Math.max(s.spendBudget, s.spendSpent), `the agreed amount · ${money(s.spendSpent, { whole: true })} spent so far`, "−")}
          <div className="pt-2.5">
            <div className="flex items-center justify-between font-semibold">
              <span>{short ? "Short this month" : "Left over"}</span>
              <span className={`num ${short ? "text-bad" : "text-good"}`}>{money(s.leftOver, { whole: true, sign: true })}</span>
            </div>
            <p className="mt-1 text-[13px] text-muted">
              {short
                ? "More is going out than coming in. The difference comes out of your accounts or goes on a card."
                : "Pay covers the plan. What's left can go to savings or an extra debt payment."}
            </p>
          </div>
          {unloggedPays ? (
            <button onClick={onLogPay} className="mt-2 w-full rounded-xl bg-brand-soft px-3 py-2 text-left text-sm font-medium text-brand">
              {unloggedPays} payday{unloggedPays === 1 ? " is" : "s are"} counted at {money(check, { whole: true })}. Log the real paycheck when it lands →
            </button>
          ) : null}
        </div>
      ) : (
        <p className="mt-1 text-sm text-muted">
          {money(s.payTotal + s.otherInTotal, { whole: true })} coming in · {money(s.billsTotal + s.debtTotal, { whole: true })} bills and debts ·{" "}
          {money(Math.max(s.spendBudget, s.spendSpent), { whole: true })} spending money
        </p>
      )}
    </Card>
  );
}

function CategoryLine({ c, spent, ym }: { c: Category; spent: number; ym: string }) {
  const plan = Number(c.monthly_plan);
  const left = plan - spent;
  return (
    <a href={`#/feed?category=${c.id}&month=${ym}`} className="block px-4 py-3 hover:bg-surface-2">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-ink-2">
          <CategoryIcon icon={c.icon} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate font-medium">{c.name}</span>
            <span className={`num shrink-0 font-semibold ${left < 0 ? "text-bad" : plan === 0 ? "text-muted" : ""}`}>
              {left < 0 ? `${money(-left, { whole: true })} over` : plan === 0 ? "$0 budget" : `${money(left, { whole: true })} left`}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-3">
            <div className="flex-1">
              <Progress value={spent} max={plan} />
            </div>
            <span className="num shrink-0 text-xs text-muted">
              {money(spent, { whole: true })} of {money(plan, { whole: true })}
            </span>
          </div>
        </div>
      </div>
    </a>
  );
}

function BillLine({ c, paid, ym, onPaid }: { c: Category; paid: number; ym: string; onPaid: () => void }) {
  const plan = Number(c.monthly_plan);
  const isCurrent = ym === thisMonth();
  const dueDay = c.due_day;
  const late = isCurrent && dueDay && paid <= 0 && parseDay(today()).getDate() > dueDay + 3;
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <a href={`#/feed?category=${c.id}&month=${ym}`} className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
            paid > 0 ? "bg-good-soft text-good" : late ? "bg-warn-soft text-warn" : "bg-surface-2 text-ink-2"
          }`}
        >
          {paid > 0 ? <Check className="size-4" strokeWidth={2.5} /> : <CategoryIcon icon={c.icon} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{c.name}</span>
          <span className={`block text-[13px] ${late ? "text-warn" : "text-muted"}`}>
            {paid > 0
              ? `Paid ${money(paid)}${Math.abs(paid - plan) > 1 ? ` · plan ${money(plan, { whole: true })}` : ""}`
              : dueDay
              ? `${late ? "Was due" : "Due"} around the ${ordinal(dueDay)} · ${money(plan)}`
              : `Not paid yet · ${money(plan)}`}
          </span>
        </span>
      </a>
      {paid > 0 ? null : (
        <button onClick={onPaid} className="h-8 shrink-0 rounded-full border border-line bg-surface px-3 text-sm font-semibold text-brand hover:bg-brand-soft">
          Paid
        </button>
      )}
    </div>
  );
}
