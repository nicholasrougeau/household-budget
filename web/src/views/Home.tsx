import { useMemo, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, CircleCheck, Plus, RefreshCw, Sparkles } from "lucide-react";
import { useEntries, useStore } from "../lib/store";
import { isDebt, summarizeMonth, CLAUDE } from "../lib/budget";
import {
  addMonths, daysBetween, money, monthBounds, monthLabel, ordinal, parseDay, paydays, relTime, shortDate, thisMonth, today,
} from "../lib/format";
import { Avatar, Button, Card, CategoryIcon, Money, Progress, SectionTitle, Spinner } from "../components/ui";
import { EntryRow } from "../components/EntryRow";
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
  const s = useMemo(
    () => (entries ? summarizeMonth(entries, state.categories, state.accounts) : null),
    [entries, state.categories, state.accounts]
  );
  const isCurrent = ym === thisMonth();
  const isFuture = ym > thisMonth();
  const t = today();
  const daysLeft = isCurrent ? days - parseDay(t).getDate() + 1 : 0;
  const checkin = state.checkins.find((c) => c.period === ym);

  const pays = paydays(state.settings.pay_anchor, state.settings.pay_every_days, from, to);
  const nextPay = paydays(state.settings.pay_anchor, state.settings.pay_every_days, t, monthBounds(addMonths(thisMonth(), 2)).to)[0];

  const cash = state.accounts.filter((a) => !a.archived && !isDebt(a));
  const debts = state.accounts.filter((a) => !a.archived && isDebt(a));
  const cashTotal = cash.reduce((sum, a) => sum + Number(latest.get(a.id)?.amount ?? 0), 0);
  const staleCash = cash.some((a) => {
    const b = latest.get(a.id);
    return !b || daysBetween(b.as_of, t) > 7;
  });

  const left = s ? s.dailyPlan - s.dailySpent : 0;

  return (
    <div className="pb-8">
      <div className="flex items-center justify-between pt-2">
        <div>
          <p className="text-sm text-muted">
            {greeting()}, {state.me.name}
          </p>
          <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight">{monthLabel(ym)}</h1>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setYm(addMonths(ym, -1))}
            className="flex size-10 items-center justify-center rounded-full hover:bg-surface-2"
            aria-label="Previous month"
          >
            <ChevronLeft className="size-5" />
          </button>
          {!isCurrent ? (
            <button onClick={() => setYm(thisMonth())} className="h-8 rounded-full bg-surface-2 px-3 text-sm font-medium">
              Today
            </button>
          ) : null}
          <button
            onClick={() => setYm(addMonths(ym, 1))}
            className="flex size-10 items-center justify-center rounded-full hover:bg-surface-2"
            aria-label="Next month"
          >
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
          {/* Hero: day-to-day money */}
          <div className="relative mt-4 overflow-hidden rounded-3xl bg-[#1f5c4d] p-5 text-white shadow-card">
            <div className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-white/[0.06]" />
            <div className="pointer-events-none absolute -bottom-20 -left-8 size-40 rounded-full bg-white/[0.05]" />
            <p className="text-sm font-medium text-white/75">
              {left >= 0 ? "Day-to-day money left" : "Day-to-day spending is over by"}
            </p>
            <p className="num mt-1 font-display text-[44px] font-semibold leading-none tracking-tight">
              {money(Math.abs(left), { whole: Math.abs(left) >= 1000 })}
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/20">
              <div
                className={`h-full rounded-full ${left < 0 ? "bg-[#F2A48F]" : "bg-[#E8B649]"}`}
                style={{ width: `${Math.min(100, s.dailyPlan ? (s.dailySpent / s.dailyPlan) * 100 : 0)}%` }}
              />
            </div>
            <div className="mt-2.5 flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm text-white/80">
              <span className="num">
                {money(s.dailySpent, { whole: true })} spent of {money(s.dailyPlan, { whole: true })}
              </span>
              {isCurrent ? (
                <span className="num">
                  {daysLeft} day{daysLeft === 1 ? "" : "s"} left
                  {left > 0 ? ` · about ${money(left / Math.max(daysLeft, 1), { whole: true })}/day` : ""}
                </span>
              ) : null}
            </div>
          </div>

          {/* Tiles */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Tile label="Money in" value={s.income} sub={
              pays.length
                ? `${s.paychecks.length} of ${pays.length} paychecks logged`
                : `${s.paychecks.length} paycheck${s.paychecks.length === 1 ? "" : "s"}`
            } />
            <Tile
              label="Bills paid"
              value={s.billsSpent}
              sub={`${s.billCats.filter((c) => (s.byCategory.get(c.id) ?? 0) > 0).length} of ${s.billCats.length} · plan ${money(s.billsPlan, { whole: true })}`}
            />
            <Tile label="Debt payments" value={s.debtPaidTotal} sub={`plan ${money(s.debtPlan, { whole: true })}`} />
            <Tile label="One-time" value={s.oneTimeTotal} sub={`${s.oneTime.length} item${s.oneTime.length === 1 ? "" : "s"} outside the plan`} />
          </div>

          {nextPay && (isCurrent || isFuture) ? (
            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-card">
              <span className="flex size-9 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <CalendarDays className="size-5" />
              </span>
              <span className="flex-1 text-sm">
                <span className="font-semibold">Next payday {shortDate(nextPay)}</span>
                <span className="block text-muted">
                  {daysBetween(t, nextPay) === 0 ? "Today" : daysBetween(t, nextPay) === 1 ? "Tomorrow" : `In ${daysBetween(t, nextPay)} days`}
                  {pays.length ? ` · ${pays.length} paydays in ${monthLabel(ym, true)}` : ""}
                </span>
              </span>
              <Button size="sm" variant="soft" onClick={() => openSheet({ type: "add", tab: "income" })}>
                Log it
              </Button>
            </div>
          ) : null}

          {checkin ? (
            <>
              <SectionTitle>Claude's check-in</SectionTitle>
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

          <SectionTitle
            action={<a href={`#/feed?month=${ym}`} className="text-sm font-medium text-brand">See all</a>}
          >
            Day to day
          </SectionTitle>
          <Card className="divide-y divide-line">
            {s.dailyCats.map((c) => (
              <CategoryLine key={c.id} c={c} spent={s.byCategory.get(c.id) ?? 0} ym={ym} />
            ))}
            {s.otherSpent ? (
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-ink-2">
                  <CategoryIcon icon="tag" />
                </span>
                <span className="flex-1 font-medium">Other</span>
                <Money value={s.otherSpent} className="font-semibold" />
              </div>
            ) : null}
          </Card>

          <SectionTitle>Bills</SectionTitle>
          <Card className="divide-y divide-line">
            {s.billCats.map((c) => (
              <BillLine key={c.id} c={c} paid={s.byCategory.get(c.id) ?? 0} ym={ym} />
            ))}
          </Card>

          <SectionTitle
            action={
              <button onClick={() => openSheet({ type: "add", tab: "expense", preset: { one_time: true } })} className="text-sm font-medium text-brand">
                Add one
              </button>
            }
          >
            One-time
          </SectionTitle>
          <Card className="overflow-hidden">
            {s.oneTime.length ? (
              <div className="divide-y divide-line">
                {s.oneTime.map((e) => (
                  <EntryRow key={e.id} e={e} />
                ))}
              </div>
            ) : (
              <p className="px-4 py-4 text-sm text-muted">
                Nothing yet. Car repairs, gifts, trips and other things outside the monthly plan go here.
              </p>
            )}
          </Card>

          <SectionTitle action={<a href="#/accounts" className="text-sm font-medium text-brand">Accounts</a>}>
            Debts
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
                    <span className="num font-semibold">{bal ? money(Number(bal.amount)) : "—"}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex-1">
                      <Progress value={paid} max={plan} tone={paid >= plan && plan > 0 ? "good" : "brand"} />
                    </div>
                    <span className="num shrink-0 text-[13px] text-muted">
                      {paid >= plan && plan > 0 ? <Check className="mr-0.5 inline size-3.5 text-good" /> : null}
                      paid {money(paid, { whole: true })} of {money(plan, { whole: true })}
                    </span>
                  </div>
                </button>
              );
            })}
            {s.interest > 0 ? (
              <div className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-muted">Interest charged this month</span>
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
            Cash on hand
          </SectionTitle>
          <Card className="p-4">
            <div className="flex items-end justify-between">
              <Money value={cashTotal} className="font-display text-3xl font-semibold tracking-tight" />
              {staleCash ? (
                <button
                  onClick={() => openSheet({ type: "add", tab: "balances" })}
                  className="rounded-full bg-warn-soft px-2.5 py-1 text-xs font-semibold text-warn"
                >
                  Some balances are over a week old
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
                    ? `${s.matched} of ${s.count} entries are matched to a bank or card statement${
                        s.manualTotal ? `, including ${s.manualMatched} of the ${s.manualTotal} you two logged` : ""
                      }.`
                    : "When the statements come in, Claude matches them to what you logged and adds anything missing."}
                </p>
                {s.business > 0 ? (
                  <p className="mt-2 text-sm text-muted">
                    Red Water costs on personal cards: {money(s.business)} (not counted in the budget).
                  </p>
                ) : null}
              </Card>
            </>
          ) : null}

          <div className="mt-8 flex justify-center">
            <Button variant="outline" onClick={() => openSheet({ type: "add", tab: "expense" })}>
              <Plus className="size-4" /> Log something
            </Button>
          </div>
          {!checkin && !isCurrent && !isFuture ? (
            <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted">
              <Sparkles className="size-3.5" /> No check-in from Claude for {monthLabel(ym)} yet.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <Card className="p-4">
      <div className="text-[13px] font-medium text-muted">{label}</div>
      <Money value={value} whole={Math.abs(value) >= 1000} className="mt-1 block font-display text-[22px] font-semibold tracking-tight" />
      <div className="mt-0.5 text-xs leading-snug text-muted">{sub}</div>
    </Card>
  );
}

function CategoryLine({ c, spent, ym }: { c: Category; spent: number; ym: string }) {
  const plan = Number(c.monthly_plan);
  const over = spent > plan;
  return (
    <a href={`#/feed?category=${c.id}&month=${ym}`} className="block px-4 py-3 hover:bg-surface-2">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-ink-2">
          <CategoryIcon icon={c.icon} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate font-medium">{c.name}</span>
            <span className="num shrink-0 text-sm">
              <span className={`font-semibold ${over ? "text-bad" : ""}`}>{money(spent, { whole: true })}</span>
              <span className="text-muted"> / {money(plan, { whole: true })}</span>
            </span>
          </div>
          <div className="mt-1.5">
            <Progress value={spent} max={plan} />
          </div>
        </div>
      </div>
    </a>
  );
}

function BillLine({ c, paid, ym }: { c: Category; paid: number; ym: string }) {
  const plan = Number(c.monthly_plan);
  const t = today();
  const isCurrent = ym === thisMonth();
  const dueDay = c.due_day;
  const late = isCurrent && dueDay && !paid && parseDay(t).getDate() > dueDay + 3;
  return (
    <a href={`#/feed?category=${c.id}&month=${ym}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
      <span
        className={`flex size-9 items-center justify-center rounded-full ${
          paid > 0 ? "bg-good-soft text-good" : late ? "bg-warn-soft text-warn" : "bg-surface-2 text-ink-2"
        }`}
      >
        {paid > 0 ? <Check className="size-4" strokeWidth={2.5} /> : <CategoryIcon icon={c.icon} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{c.name}</span>
        <span className="block text-[13px] text-muted">
          {paid > 0
            ? `Paid${Math.abs(paid - plan) > 1 ? ` · plan ${money(plan)}` : ""}`
            : dueDay
            ? `${late ? "Was due" : "Due"} around the ${ordinal(dueDay)}`
            : "Not paid yet"}
        </span>
      </span>
      <Money value={paid > 0 ? paid : plan} className={`font-semibold ${paid > 0 ? "" : "text-muted"}`} />
    </a>
  );
}
