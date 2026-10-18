import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useStore, type AddTab } from "../lib/store";
import { isDebt } from "../lib/budget";
import { money, parseAmount, shortDate, today } from "../lib/format";
import type { Account, Balance, Category, Entry } from "../lib/types";
import { Button, CategoryIcon, Chip, Field, inputCls, Segmented, Sheet, Toggle } from "../components/ui";

const LAST_ACCOUNT = "rb.lastAccount";
const remembered = (k: string) => {
  try {
    return localStorage.getItem(`${LAST_ACCOUNT}.${k}`);
  } catch {
    return null;
  }
};
const remember = (k: string, v: string | null) => {
  try {
    if (v) localStorage.setItem(`${LAST_ACCOUNT}.${k}`, v);
  } catch {
    /* ignore */
  }
};

export function AddSheet({ tab: initialTab, entry, preset }: { tab?: AddTab; entry?: Entry; preset?: Partial<Entry> }) {
  const { state, closeSheet, refresh, toast } = useStore();
  const editing = !!entry;
  const [tab, setTab] = useState<AddTab>(
    entry ? (entry.kind === "refund" ? "expense" : (entry.kind as AddTab)) : initialTab ?? "expense"
  );
  return (
    <Sheet
      open
      onClose={closeSheet}
      title={editing ? "Edit entry" : "Log something"}
    >
      {!editing ? (
        <div className="mb-4">
          <Segmented<AddTab>
            value={tab}
            onChange={setTab}
            options={[
              { value: "expense", label: "Spent" },
              { value: "income", label: "Got paid" },
              { value: "transfer", label: "Moved" },
              { value: "balances", label: "Balances" },
            ]}
          />
        </div>
      ) : null}
      {tab === "balances" ? (
        <BalancesForm
          accounts={state.accounts.filter((a) => !a.archived)}
          balances={state.balances}
          onSaved={() => {
            toast("Balances saved");
            refresh();
            closeSheet();
          }}
        />
      ) : (
        <EntryForm
          key={tab}
          kind={tab}
          entry={entry}
          preset={preset}
          onSaved={(msg) => {
            toast(msg);
            refresh();
            closeSheet();
          }}
        />
      )}
    </Sheet>
  );
}

function EntryForm({
  kind,
  entry,
  preset,
  onSaved,
}: {
  kind: Exclude<AddTab, "balances">;
  entry?: Entry;
  preset?: Partial<Entry>;
  onSaved: (msg: string) => void;
}) {
  const { state } = useStore();
  const accounts = state.accounts.filter((a) => !a.archived || a.id === entry?.account_id || a.id === entry?.to_account_id);
  const cats = state.categories.filter((c) => !c.archived || c.id === entry?.category_id);
  const incomeCats = cats.filter((c) => c.kind === "income");
  const paycheckCat = incomeCats.find((c) => c.name.toLowerCase().includes("paycheck"));

  const [amount, setAmount] = useState(entry ? String(Number(entry.amount)) : preset?.amount ? String(Number(preset.amount)) : "");
  const [title, setTitle] = useState(entry?.title ?? preset?.title ?? (kind === "income" ? "Paycheck" : ""));
  const [categoryId, setCategoryId] = useState<string | null>(
    entry?.category_id ?? preset?.category_id ?? (kind === "income" ? paycheckCat?.id ?? null : null)
  );
  const [accountId, setAccountId] = useState<string | null>(
    entry?.account_id ?? preset?.account_id ?? remembered(kind) ?? null
  );
  const [toAccountId, setToAccountId] = useState<string | null>(entry?.to_account_id ?? null);
  const [date, setDate] = useState(entry?.occurred_on ?? today());
  const [refund, setRefund] = useState(entry?.kind === "refund");
  const [flagged, setFlagged] = useState(entry?.flagged ?? false);
  const [note, setNote] = useState(entry?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const touched = useRef({ category: !!entry, account: !!entry });
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!entry) amountRef.current?.focus();
  }, [entry]);

  // Past titles power suggestions, and pick the category/account used last time.
  const [history, setHistory] = useState<Entry[]>([]);
  useEffect(() => {
    if (kind === "transfer") return;
    api<{ entries: Entry[] }>("/entries?limit=400").then((r) => setHistory(r.entries)).catch(() => {});
  }, [kind]);
  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const e of history) {
      if ((kind === "income") !== (e.kind === "income")) continue;
      const k = e.title.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push(e.title);
      }
    }
    return out.slice(0, 80);
  }, [history, kind]);

  function onTitle(v: string) {
    setTitle(v);
    const match = history.find((e) => e.title.toLowerCase() === v.trim().toLowerCase() && e.kind !== "transfer");
    if (match) {
      if (!touched.current.category && match.category_id) setCategoryId(match.category_id);
      if (!touched.current.account && match.account_id) setAccountId(match.account_id);
    }
  }

  const transferTitle = (toId: string | null) => {
    const to = state.accounts.find((a) => a.id === toId);
    if (!to) return "";
    return isDebt(to) ? `Payment to ${to.name}` : `Move to ${to.name}`;
  };

  async function save() {
    setError(null);
    const amt = parseAmount(amount);
    if (!(amt > 0)) return setError("Enter an amount");
    const t = (kind === "transfer" ? title || transferTitle(toAccountId) : title).trim();
    if (!t) return setError(kind === "income" ? "Where did the money come from?" : "What was it?");
    if (kind === "expense" && !categoryId) return setError("Pick a category");
    if (kind === "transfer" && (!accountId || !toAccountId)) return setError("Pick both accounts");
    const body = {
      kind: kind === "expense" && refund ? "refund" : kind,
      amount: amt,
      title: t,
      category_id: kind === "transfer" ? null : categoryId,
      account_id: accountId,
      to_account_id: kind === "transfer" ? toAccountId : null,
      occurred_on: date,
      one_time: entry?.one_time ?? false,
      flagged,
      note: note.trim() || null,
    };
    setBusy(true);
    try {
      if (entry) await api(`/entries/${entry.id}`, { method: "PATCH", body });
      else await api("/entries", { method: "POST", body });
      remember(kind, accountId);
      onSaved(entry ? "Saved" : kind === "income" ? `Logged ${money(amt)} in` : `Logged ${money(amt)}`);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  const groups = useMemo(() => {
    if (kind === "income") return [{ name: "", cats: incomeCats }];
    const order = ["spending", "bill", "other", "debt", "business"];
    const g = new Map<string, Category[]>();
    for (const c of cats.filter((c) => c.kind !== "income").sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.sort - b.sort)) {
      const key = c.kind === "spending" ? "Day to day" : c.kind === "bill" ? "Bills" : "Other";
      g.set(key, [...(g.get(key) ?? []), c]);
    }
    return [...g.entries()].map(([name, cats]) => ({ name, cats }));
  }, [kind, cats, incomeCats]);

  const cashAccounts = accounts.filter((a) => !isDebt(a));
  const payWith = kind === "income" ? cashAccounts : accounts;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="space-y-5"
    >
      <div className="flex items-center justify-center gap-1 rounded-2xl bg-surface px-4 py-5 shadow-card">
        <span className="font-display text-4xl font-semibold text-muted">$</span>
        <input
          ref={amountRef}
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
          inputMode="decimal"
          placeholder="0.00"
          aria-label="Amount"
          className="num min-w-0 bg-transparent font-display text-5xl font-semibold tracking-tight outline-none placeholder:text-surface-3"
          style={{ fontSize: 48, width: `${Math.max(amount.length || 4, 1) + 0.6}ch` }}
        />
      </div>

      {kind === "transfer" ? (
        <>
          <AccountPicker label="From" accounts={cashAccounts} value={accountId} onChange={setAccountId} />
          <AccountPicker
            label="To"
            accounts={accounts.filter((a) => a.id !== accountId)}
            value={toAccountId}
            onChange={(v) => {
              setToAccountId(v);
              if (!title || title === transferTitle(toAccountId)) setTitle(transferTitle(v));
            }}
          />
          <Field label="Label">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="Card payment" maxLength={140} />
          </Field>
        </>
      ) : (
        <>
          <Field label={kind === "income" ? "From" : "What was it?"}>
            <input
              value={title}
              onChange={(e) => onTitle(e.target.value)}
              list="title-suggestions"
              className={inputCls}
              placeholder={kind === "income" ? "Paycheck" : "Walmart, gas, date night…"}
              maxLength={140}
              autoCapitalize="sentences"
            />
            <datalist id="title-suggestions">
              {suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink-2">Category</span>
            <div className="space-y-3">
              {groups.map((g) => (
                <div key={g.name}>
                  {g.name ? <div className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{g.name}</div> : null}
                  <div className="flex flex-wrap gap-2">
                    {g.cats.map((c) => (
                      <Chip
                        key={c.id}
                        active={categoryId === c.id}
                        onClick={() => {
                          touched.current.category = true;
                          setCategoryId(c.id);
                        }}
                      >
                        <CategoryIcon icon={c.icon} className="size-3.5" />
                        {c.name}
                      </Chip>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <AccountPicker
            label={kind === "income" ? "Went into" : "Paid with"}
            accounts={payWith}
            value={accountId}
            onChange={(v) => {
              touched.current.account = true;
              setAccountId(v);
            }}
          />
        </>
      )}

      <Field label="Date">
        <input type="date" value={date} max="2100-01-01" onChange={(e) => setDate(e.target.value || today())} className={inputCls} />
      </Field>

      {kind === "expense" ? (
        <div className="rounded-2xl border border-line bg-surface px-3 py-1">
          <Toggle checked={refund} onChange={setRefund} label="This is a refund" hint="Money back. It comes off the category." />
        </div>
      ) : null}

      <Field label="Note (optional)">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} className={`${inputCls} resize-none`} placeholder="Anything worth remembering" />
      </Field>

      <div className="rounded-2xl border border-line bg-surface px-3 py-1">
        <Toggle checked={flagged} onChange={setFlagged} label="Talk about this" hint="Flags it in the feed so you two remember to discuss it." />
      </div>

      {error ? <p role="alert" className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-sm font-medium text-bad">{error}</p> : null}

      <Button type="submit" size="lg" className="w-full" busy={busy}>
        {entry ? "Save changes" : "Save"}
      </Button>
    </form>
  );
}

function AccountPicker({
  label,
  accounts,
  value,
  onChange,
}: {
  label: string;
  accounts: Account[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink-2">{label}</span>
      <div className="flex flex-wrap gap-2">
        {accounts.map((a) => (
          <Chip key={a.id} active={value === a.id} onClick={() => onChange(a.id)}>
            <CategoryIcon icon={a.kind === "credit" ? "credit-card" : a.kind === "savings" ? "piggy-bank" : a.kind === "cash" ? "wallet" : "landmark"} className="size-3.5" />
            {a.name}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function BalancesForm({ accounts, balances, onSaved }: { accounts: Account[]; balances: Balance[]; onSaved: () => void }) {
  const latest = useMemo(() => {
    const m = new Map<string, Balance>();
    for (const b of balances) if (!m.has(b.account_id)) m.set(b.account_id, b);
    return m;
  }, [balances]);
  const [date, setDate] = useState(today());
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cash = accounts.filter((a) => !isDebt(a));
  const debts = accounts.filter(isDebt);

  async function save() {
    setError(null);
    const items = Object.entries(vals)
      .filter(([, v]) => v.trim() !== "")
      .map(([account_id, v]) => ({ account_id, amount: parseAmount(v) }));
    if (!items.length) return setError("Enter at least one balance");
    if (items.some((i) => !(i.amount >= 0))) return setError("One of those amounts isn't a number");
    setBusy(true);
    try {
      await api("/balances", { method: "POST", body: { as_of: date, items } });
      onSaved();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  const row = (a: Account) => {
    const b = latest.get(a.id);
    return (
      <label key={a.id} className="flex items-center gap-3 px-4 py-2.5">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{a.name}</span>
          <span className="block text-xs text-muted">
            {b ? `${money(Number(b.amount))} on ${shortDate(b.as_of)}` : "No balance yet"}
          </span>
        </span>
        <span className="relative w-36 shrink-0">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">$</span>
          <input
            inputMode="decimal"
            value={vals[a.id] ?? ""}
            onChange={(e) => setVals((v) => ({ ...v, [a.id]: e.target.value.replace(/[^0-9.,]/g, "") }))}
            placeholder={b ? String(Number(b.amount)) : "0.00"}
            className={`${inputCls} num pl-7 text-right`}
            aria-label={`${a.name} balance`}
          />
        </span>
      </label>
    );
  };

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <p className="text-sm text-muted">
        Check your bank apps and type what's there now. Leave a box empty to skip it. For cards, enter what you owe.
      </p>
      <Field label="As of">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value || today())} className={inputCls} />
      </Field>
      <div>
        <div className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">Money you have</div>
        <div className="divide-y divide-line rounded-2xl border border-line bg-surface">{cash.map(row)}</div>
      </div>
      <div>
        <div className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">What you owe</div>
        <div className="divide-y divide-line rounded-2xl border border-line bg-surface">{debts.map(row)}</div>
      </div>
      {error ? <p role="alert" className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-sm font-medium text-bad">{error}</p> : null}
      <Button type="submit" size="lg" className="w-full" busy={busy}>
        Save balances
      </Button>
    </form>
  );
}
