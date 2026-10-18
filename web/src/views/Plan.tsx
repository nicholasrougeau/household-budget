import { useMemo, useState } from "react";
import { Calculator, ExternalLink, Plus } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useStore } from "../lib/store";
import { isDebt, planPerPaycheck } from "../lib/budget";
import { money, ordinal } from "../lib/format";
import type { Category, CategoryKind } from "../lib/types";
import { Button, Card, CategoryIcon, CATEGORY_ICONS, Field, inputCls, Money, SectionTitle, Sheet } from "../components/ui";

const PLANNER_URL = "https://claude.ai/artifact/X58VN5Lu2u1pHnSeG7qoZG";

export function Plan() {
  const { state, refresh, toast } = useStore();
  const [adding, setAdding] = useState(false);
  const live = state.categories.filter((c) => !c.archived);
  const bills = live.filter((c) => c.kind === "bill");
  const daily = live.filter((c) => c.kind === "spending");
  const debts = state.accounts.filter((a) => !a.archived && isDebt(a));
  const billsTotal = bills.reduce((s, c) => s + Number(c.monthly_plan), 0);
  const dailyTotal = daily.reduce((s, c) => s + Number(c.monthly_plan), 0);
  const debtTotal = debts.reduce((s, a) => s + Number(a.plan_payment ?? 0), 0);
  const total = billsTotal + dailyTotal + debtTotal;
  const perCheck = planPerPaycheck(total);
  const check = Number(state.settings.typical_check ?? 0);

  const groups = useMemo(() => {
    const m = new Map<string, Category[]>();
    for (const c of [...bills, ...daily]) m.set(c.grp, [...(m.get(c.grp) ?? []), c]);
    return [...m.entries()];
  }, [bills, daily]);

  async function saveCategory(c: Category, patch: Partial<Category>) {
    try {
      await api(`/categories/${c.id}`, { method: "PATCH", body: patch });
      refresh();
    } catch (e) {
      toast((e as ApiError).message, "error");
    }
  }
  async function savePayment(id: string, v: number) {
    try {
      await api(`/accounts/${id}`, { method: "PATCH", body: { plan_payment: v } });
      refresh();
    } catch (e) {
      toast((e as ApiError).message, "error");
    }
  }

  return (
    <div className="pb-8">
      <h1 className="pt-2 font-display text-[28px] font-semibold tracking-tight">The plan</h1>
      <p className="text-sm text-muted">What a normal month should cost. Tap any amount to change it; it saves for both of you.</p>

      <Card className="mt-4 p-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-[13px] font-medium text-muted">Every month</div>
            <Money value={total} className="font-display text-[32px] font-semibold tracking-tight" />
          </div>
          <div className="text-right">
            <div className="text-[13px] font-medium text-muted">Per paycheck</div>
            <Money value={perCheck} className="font-display text-2xl font-semibold tracking-tight" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-xl bg-surface-2 px-2 py-2">
            <div className="text-muted">Bills</div>
            <Money value={billsTotal} whole className="font-semibold" />
          </div>
          <div className="rounded-xl bg-surface-2 px-2 py-2">
            <div className="text-muted">Day to day</div>
            <Money value={dailyTotal} whole className="font-semibold" />
          </div>
          <div className="rounded-xl bg-surface-2 px-2 py-2">
            <div className="text-muted">Debts</div>
            <Money value={debtTotal} whole className="font-semibold" />
          </div>
        </div>
        {check ? (
          <p className={`mt-4 rounded-xl px-3.5 py-2.5 text-sm font-medium ${check >= perCheck ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>
            {check >= perCheck
              ? `A ${money(check, { whole: true })} check covers it with ${money(check - perCheck, { whole: true })} left for savings and extra debt.`
              : `A ${money(check, { whole: true })} check is ${money(perCheck - check, { whole: true })} short of the plan. A month with three paydays helps.`}
          </p>
        ) : null}
        <p className="mt-3 text-xs text-muted">Paid every two weeks means 26 checks a year, so per paycheck = monthly × 12 ÷ 26.</p>
      </Card>

      {groups.map(([grp, cats]) => (
        <div key={grp}>
          <SectionTitle>{grp}</SectionTitle>
          <Card className="divide-y divide-line">
            {cats.map((c) => (
              <PlanRow
                key={c.id}
                icon={c.icon}
                name={c.name}
                sub={c.kind === "bill" && c.due_day ? `Due around the ${ordinal(c.due_day)}` : undefined}
                value={Number(c.monthly_plan)}
                onSave={(v) => saveCategory(c, { monthly_plan: v })}
              />
            ))}
          </Card>
        </div>
      ))}

      <SectionTitle>Debt payments</SectionTitle>
      <Card className="divide-y divide-line">
        {debts.map((a) => (
          <PlanRow key={a.id} icon="credit-card" name={a.name} sub={a.min_payment ? `Minimum ${money(Number(a.min_payment))}` : undefined} value={Number(a.plan_payment ?? 0)} onSave={(v) => savePayment(a.id, v)} />
        ))}
      </Card>

      <div className="mt-6 flex flex-col items-center gap-3">
        <Button variant="outline" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Add a category
        </Button>
        <a href={PLANNER_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand">
          <Calculator className="size-4" /> Paycheck Planner: what if checks get bigger? <ExternalLink className="size-3.5" />
        </a>
      </div>

      {adding ? <NewCategory onClose={() => setAdding(false)} groups={[...new Set(state.categories.map((c) => c.grp))]} /> : null}
    </div>
  );
}

function PlanRow({ icon, name, sub, value, onSave }: { icon?: string | null; name: string; sub?: string; value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const shown = focused ? v : String(value);
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-ink-2">
        <CategoryIcon icon={icon} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{name}</span>
        {sub ? <span className="block text-[13px] text-muted">{sub}</span> : null}
      </span>
      <span className="relative w-28 shrink-0">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">$</span>
        <input
          inputMode="decimal"
          value={shown}
          aria-label={`${name} monthly plan`}
          onFocus={() => {
            setV(String(value));
            setFocused(true);
          }}
          onChange={(e) => setV(e.target.value.replace(/[^0-9.]/g, ""))}
          onBlur={() => {
            setFocused(false);
            const n = Math.round(Number(v || 0) * 100) / 100;
            if (Number.isFinite(n) && n !== value) onSave(n);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="num h-10 w-full rounded-xl border border-transparent bg-surface-2 pr-3 pl-7 text-right font-semibold outline-none focus:border-brand focus:bg-surface"
        />
      </span>
    </div>
  );
}

function NewCategory({ onClose, groups }: { onClose: () => void; groups: string[] }) {
  const { refresh, toast } = useStore();
  const [name, setName] = useState("");
  const [grp, setGrp] = useState("Day to day");
  const [kind, setKind] = useState<CategoryKind>("spending");
  const [plan, setPlan] = useState("");
  const [icon, setIcon] = useState("tag");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api("/categories", { method: "POST", body: { name, grp, kind, monthly_plan: plan || 0, icon, sort: 500 } });
      toast("Category added");
      refresh();
      onClose();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title="New category">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={60} required autoFocus />
        </Field>
        <Field label="Type">
          <select value={kind} onChange={(e) => setKind(e.target.value as CategoryKind)} className={inputCls}>
            <option value="spending">Day to day (counts against the monthly plan)</option>
            <option value="bill">Bill (paid once a month)</option>
            <option value="other">Other (not in the plan)</option>
            <option value="income">Money in</option>
            <option value="business">Red Water (not counted)</option>
          </select>
        </Field>
        <Field label="Group">
          <input value={grp} onChange={(e) => setGrp(e.target.value)} list="groups" className={inputCls} maxLength={60} required />
          <datalist id="groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </Field>
        {kind === "spending" || kind === "bill" ? (
          <Field label="Monthly plan">
            <input value={plan} onChange={(e) => setPlan(e.target.value)} inputMode="decimal" className={inputCls} placeholder="0" />
          </Field>
        ) : null}
        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink-2">Icon</span>
          <div className="grid grid-cols-8 gap-1.5">
            {Object.keys(CATEGORY_ICONS).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setIcon(k)}
                aria-label={k}
                className={`flex aspect-square items-center justify-center rounded-xl ${icon === k ? "bg-brand text-brand-ink" : "bg-surface-2 text-ink-2"}`}
              >
                <CategoryIcon icon={k} />
              </button>
            ))}
          </div>
        </div>
        {error ? <p className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-sm text-bad">{error}</p> : null}
        <Button type="submit" className="w-full" busy={busy}>
          Add category
        </Button>
      </form>
    </Sheet>
  );
}
