import { useState } from "react";
import { Hourglass, Plus, RefreshCw, Trash } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useStore } from "../lib/store";
import { isDebt, previousBalance } from "../lib/budget";
import { daysBetween, money, monthLabel, shortDate, today } from "../lib/format";
import type { Account, AccountKind } from "../lib/types";
import { Avatar, Button, Card, CategoryIcon, Field, inputCls, Money, Progress, SectionTitle, Segmented, Sheet } from "../components/ui";

const kindIcon = (k: AccountKind) => (k === "credit" || k === "loan" ? "credit-card" : k === "savings" ? "piggy-bank" : k === "cash" ? "wallet" : "landmark");

export function Accounts() {
  const { state, latest, openSheet } = useStore();
  const live = state.accounts.filter((a) => !a.archived);
  const cash = live.filter((a) => !isDebt(a));
  const debts = live.filter(isDebt);
  const cashTotal = cash.reduce((s, a) => s + Number(latest.get(a.id)?.amount ?? 0), 0);
  const debtTotal = debts.reduce((s, a) => s + Number(latest.get(a.id)?.amount ?? 0), 0);
  const startTotal = debts.reduce((s, a) => s + Number(a.starting_balance ?? latest.get(a.id)?.amount ?? 0), 0);

  return (
    <div className="pb-8">
      <div className="flex items-end justify-between pt-2">
        <h1 className="font-display text-[28px] font-semibold tracking-tight">Accounts</h1>
        <Button size="sm" variant="soft" onClick={() => openSheet({ type: "add", tab: "balances" })}>
          <RefreshCw className="size-3.5" /> Update balances
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="text-[13px] font-medium text-muted">You have</div>
          <Money value={cashTotal} whole className="mt-1 block font-display text-2xl font-semibold tracking-tight text-good" />
        </Card>
        <Card className="p-4">
          <div className="text-[13px] font-medium text-muted">You owe</div>
          <Money value={debtTotal} whole className="mt-1 block font-display text-2xl font-semibold tracking-tight text-bad" />
          {startTotal > debtTotal ? (
            <div className="mt-0.5 text-xs text-muted">{money(startTotal - debtTotal, { whole: true })} paid off so far</div>
          ) : null}
        </Card>
      </div>

      <SectionTitle>Money you have</SectionTitle>
      <Card className="divide-y divide-line overflow-hidden">
        {cash.map((a) => (
          <AccountRow key={a.id} a={a} />
        ))}
      </Card>

      <SectionTitle>Debts</SectionTitle>
      <div className="space-y-3">
        {debts.map((a) => (
          <DebtCard key={a.id} a={a} />
        ))}
      </div>

      <div className="mt-6 flex justify-center">
        <Button variant="outline" onClick={() => openSheet({ type: "account-new" })}>
          <Plus className="size-4" /> Add an account
        </Button>
      </div>
    </div>
  );
}

function AccountRow({ a }: { a: Account }) {
  const { latest, state, members, openSheet } = useStore();
  const b = latest.get(a.id);
  const prev = previousBalance(state.balances, a.id);
  const change = b && prev ? Number(b.amount) - Number(prev.amount) : 0;
  const stale = !b || daysBetween(b.as_of, today()) > 7;
  return (
    <button onClick={() => openSheet({ type: "account", id: a.id })} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-2">
      <span className="flex size-10 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
        <CategoryIcon icon={kindIcon(a.kind)} className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{a.name}</span>
        <span className={`block text-[13px] ${stale ? "text-warn" : "text-muted"}`}>
          {b ? (
            <span className="inline-flex items-center gap-1">
              {shortDate(b.as_of)}
              {b.created_by ? <>· <Avatar who={members.get(b.created_by)} size={14} /></> : null}
              {stale ? " · update it" : ""}
            </span>
          ) : (
            "No balance yet"
          )}
        </span>
      </span>
      <span className="text-right">
        <span className="num block font-semibold">{b ? money(Number(b.amount)) : "—"}</span>
        {change ? (
          <span className={`num block text-xs ${change > 0 ? "text-good" : "text-bad"}`}>{money(change, { sign: true })}</span>
        ) : null}
      </span>
    </button>
  );
}

function DebtCard({ a }: { a: Account }) {
  const { latest, openSheet } = useStore();
  const b = latest.get(a.id);
  const bal = Number(b?.amount ?? 0);
  const start = Number(a.starting_balance ?? bal);
  const paidOff = Math.max(0, start - bal);
  const t = today();
  const promoDays = a.promo_end ? daysBetween(t, a.promo_end) : null;
  const promoMonths = promoDays !== null ? Math.max(1, Math.ceil(promoDays / 30.44)) : null;
  const apr = Number(a.apr ?? 0);
  return (
    <Card className="overflow-hidden">
      <button onClick={() => openSheet({ type: "account", id: a.id })} className="block w-full p-4 text-left hover:bg-surface-2">
        <div className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-bad-soft text-bad">
            <CategoryIcon icon="credit-card" className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{a.name}</span>
            <span className="block text-[13px] text-muted">
              {promoDays !== null && promoDays > 0 ? "0% for now" : `${apr.toFixed(2)}% APR`}
              {a.plan_payment ? ` · plan ${money(Number(a.plan_payment), { whole: true })}/mo` : ""}
            </span>
          </span>
          <span className="text-right">
            <span className="num block text-lg font-semibold">{b ? money(bal) : "—"}</span>
            {b ? <span className="block text-xs text-muted">{shortDate(b.as_of)}</span> : null}
          </span>
        </div>
        {start > 0 ? (
          <div className="mt-3">
            <Progress value={paidOff} max={start} tone="good" />
            <div className="mt-1.5 flex justify-between text-xs text-muted">
              <span className="num">{money(paidOff, { whole: true })} paid off</span>
              <span className="num">started at {money(start, { whole: true })}</span>
            </div>
          </div>
        ) : null}
        {promoDays !== null && bal > 0 ? (
          <div className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm ${promoDays < 120 ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn"}`}>
            <Hourglass className="mt-0.5 size-4 shrink-0" />
            <span>
              {promoDays > 0 ? (
                <>
                  0% ends {monthLabel(a.promo_end!.slice(0, 7))} ({promoDays} days). Pay about{" "}
                  <b className="num">{money(bal / (promoMonths ?? 1), { whole: true })}/mo</b> to clear it in time, or{" "}
                  {Number(a.promo_apr ?? 0).toFixed(2)}% interest gets charged back.
                </>
              ) : (
                <>The 0% deal has ended.</>
              )}
            </span>
          </div>
        ) : null}
      </button>
    </Card>
  );
}

export function AccountSheet({ id }: { id?: string }) {
  const { state, members, closeSheet, refresh, toast } = useStore();
  const a = id ? state.accounts.find((x) => x.id === id) : undefined;
  const [name, setName] = useState(a?.name ?? "");
  const [kind, setKind] = useState<AccountKind>(a?.kind ?? "checking");
  const [holder, setHolder] = useState(a?.holder ?? "");
  const [apr, setApr] = useState(a?.apr != null ? String(Number(a.apr)) : "");
  const [plan, setPlan] = useState(a?.plan_payment != null ? String(Number(a.plan_payment)) : "");
  const [start, setStart] = useState(a?.starting_balance != null ? String(Number(a.starting_balance)) : "");
  const [promoEnd, setPromoEnd] = useState(a?.promo_end ?? "");
  const [promoApr, setPromoApr] = useState(a?.promo_apr != null ? String(Number(a.promo_apr)) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const history = id ? state.balances.filter((b) => b.account_id === id) : [];
  const debt = kind === "credit" || kind === "loan";

  async function save() {
    setError(null);
    const body = {
      name,
      kind,
      holder: holder || null,
      apr: debt ? apr || null : null,
      plan_payment: debt ? plan || null : null,
      starting_balance: debt ? start || null : null,
      promo_end: debt ? promoEnd || null : null,
      promo_apr: debt ? promoApr || null : null,
    };
    setBusy(true);
    try {
      if (a) await api(`/accounts/${a.id}`, { method: "PATCH", body });
      else await api("/accounts", { method: "POST", body: { ...body, sort: state.accounts.length * 10 + 10 } });
      toast("Saved");
      refresh();
      closeSheet();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!a || !window.confirm(`Hide ${a.name}? Its history stays.`)) return;
    await api(`/accounts/${a.id}`, { method: "PATCH", body: { archived: true } }).catch((e) => toast(e.message, "error"));
    refresh();
    closeSheet();
  }

  async function deleteBalance(bid: string) {
    if (!window.confirm("Delete this balance entry?")) return;
    await api(`/balances/${bid}`, { method: "DELETE" }).catch((e) => toast(e.message, "error"));
    refresh();
  }

  return (
    <Sheet open onClose={closeSheet} title={a ? a.name : "New account"}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={60} required />
        </Field>
        <Segmented<AccountKind>
          value={kind}
          onChange={setKind}
          options={[
            { value: "checking", label: "Checking" },
            { value: "savings", label: "Savings" },
            { value: "credit", label: "Card" },
            { value: "loan", label: "Loan" },
            { value: "cash", label: "Cash" },
          ]}
        />
        <Field label="Whose is it?">
          <input value={holder} onChange={(e) => setHolder(e.target.value)} className={inputCls} placeholder="Nick, Meghan or Joint" maxLength={60} />
        </Field>
        {debt ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="APR %">
              <input value={apr} onChange={(e) => setApr(e.target.value)} inputMode="decimal" className={inputCls} />
            </Field>
            <Field label="Plan to pay / month">
              <input value={plan} onChange={(e) => setPlan(e.target.value)} inputMode="decimal" className={inputCls} />
            </Field>
            <Field label="Balance when we started">
              <input value={start} onChange={(e) => setStart(e.target.value)} inputMode="decimal" className={inputCls} />
            </Field>
            <Field label="0% deal ends">
              <input type="date" value={promoEnd} onChange={(e) => setPromoEnd(e.target.value)} className={inputCls} />
            </Field>
            {promoEnd ? (
              <Field label="APR after the deal %">
                <input value={promoApr} onChange={(e) => setPromoApr(e.target.value)} inputMode="decimal" className={inputCls} />
              </Field>
            ) : null}
          </div>
        ) : null}
        {error ? <p className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-sm text-bad">{error}</p> : null}
        <Button type="submit" className="w-full" busy={busy}>
          Save
        </Button>
      </form>

      {a ? (
        <>
          <h3 className="mt-7 mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">Balance history</h3>
          {history.length ? (
            <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {history.map((b) => (
                <div key={b.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <Avatar who={b.created_by ? members.get(b.created_by) : "claude"} size={24} />
                  <span className="flex-1">{shortDate(b.as_of, true)}</span>
                  <span className="num font-semibold">{money(Number(b.amount))}</span>
                  <button onClick={() => deleteBalance(b.id)} className="text-muted hover:text-bad" aria-label="Delete balance">
                    <Trash className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No balances yet.</p>
          )}
          <div className="mt-6 flex justify-center gap-2">
            <button
              onClick={() => {
                closeSheet();
                window.setTimeout(() => (location.hash = `#/feed?account=${a.id}`), 60);
              }}
              className="inline-flex h-10 items-center rounded-xl px-3 text-sm font-semibold text-brand hover:bg-surface-2"
            >
              See its transactions
            </button>
            <Button variant="ghost" size="md" onClick={archive} className="text-bad">
              Hide account
            </Button>
          </div>
        </>
      ) : null}
    </Sheet>
  );
}
