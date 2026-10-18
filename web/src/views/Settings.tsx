import { useState } from "react";
import { KeyRound, LogOut, Smartphone, Sparkles } from "lucide-react";
import { api, ApiError, session } from "../lib/api";
import { useStore } from "../lib/store";
import { money } from "../lib/format";
import type { Member } from "../lib/types";
import { Avatar, Button, Card, Field, inputCls, SectionTitle, Sheet } from "../components/ui";
import { SetPin } from "./SetPin";

const COLORS = ["#2F5D8A", "#9C4A6B", "#1F5C4D", "#7A5AA6", "#B26A1F", "#3E7F86", "#A33F3F", "#5B6B2E"];

export function Settings() {
  const { state, refresh, toast, signOut } = useStore();
  const [pinOpen, setPinOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [tempPin, setTempPin] = useState<{ name: string; pin: string } | null>(null);
  const [anchor, setAnchor] = useState(state.settings.pay_anchor ?? "");
  const [every, setEvery] = useState(String(state.settings.pay_every_days ?? 14));
  const [check, setCheck] = useState(String(state.settings.typical_check ?? ""));
  const [savingPay, setSavingPay] = useState(false);

  async function savePay() {
    setSavingPay(true);
    try {
      await api("/settings/pay_anchor", { method: "PUT", body: { value: anchor || null } });
      await api("/settings/pay_every_days", { method: "PUT", body: { value: Number(every) || 14 } });
      await api("/settings/typical_check", { method: "PUT", body: { value: Number(check) || 0 } });
      toast("Pay schedule saved");
      refresh();
    } catch (e) {
      toast((e as ApiError).message, "error");
    } finally {
      setSavingPay(false);
    }
  }

  async function resetPin(m: Member) {
    if (!window.confirm(`Give ${m.name} a new temporary PIN? Their current PIN stops working and they'll pick a new one at sign-in.`)) return;
    try {
      const r = await api<{ pin: string }>(`/members/${m.id}/reset-pin`, { method: "POST" });
      setTempPin({ name: m.name, pin: r.pin });
    } catch (e) {
      toast((e as ApiError).message, "error");
    }
  }

  async function signOutEverywhere() {
    if (!window.confirm("Sign out on every phone and computer, including this one?")) return;
    await api("/auth/logout-all", { method: "POST" }).catch(() => {});
    session.set(null);
    signOut();
  }

  return (
    <div className="pb-8">
      <h1 className="pt-2 font-display text-[28px] font-semibold tracking-tight">Settings</h1>

      <SectionTitle>The two of you</SectionTitle>
      <Card className="divide-y divide-line">
        {state.members.map((m) => {
          const me = m.id === state.me.id;
          return (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar who={m} size={40} />
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {m.name} {me ? <span className="text-sm font-normal text-muted">(you)</span> : null}
                </div>
                <div className="truncate text-[13px] text-muted">{m.email}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setEditing(m)}>
                Edit
              </Button>
              {me ? (
                <Button size="sm" variant="soft" onClick={() => setPinOpen(true)}>
                  <KeyRound className="size-3.5" /> PIN
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => resetPin(m)}>
                  Reset PIN
                </Button>
              )}
            </div>
          );
        })}
      </Card>
      <p className="mt-2 px-1 text-sm text-muted">You both see and can change everything. Neither of you is the admin.</p>

      <SectionTitle>Pay schedule</SectionTitle>
      <Card className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="A payday">
            <input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Every (days)">
            <input value={every} onChange={(e) => setEvery(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={inputCls} />
          </Field>
        </div>
        <Field label="Typical paycheck" hint={check ? `About ${money((Number(check) * 26) / 12, { whole: true })} a month on average.` : undefined}>
          <input value={check} onChange={(e) => setCheck(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className={inputCls} />
        </Field>
        <Button onClick={savePay} busy={savingPay} className="w-full" variant="soft">
          Save pay schedule
        </Button>
      </Card>

      <SectionTitle>How Claude helps</SectionTitle>
      <Card className="flex gap-3 p-4">
        <Avatar who="claude" size={32} />
        <div className="space-y-2 text-[15px] leading-relaxed text-ink-2">
          <p>
            When Nick downloads the month's bank and card statements and asks Claude to check the budget, Claude matches each
            statement line to what you logged and marks it <b className="text-good">matched</b>.
          </p>
          <p>
            Anything you didn't log gets added with Claude as the author, using receipts and bills from email to fill in the
            details. Anything you logged that never showed up gets a comment asking about it. Then Claude posts a short
            check-in on the Home screen for that month.
          </p>
        </div>
      </Card>

      <SectionTitle>On your phone</SectionTitle>
      <Card className="flex gap-3 p-4 text-[15px] text-ink-2">
        <Smartphone className="mt-0.5 size-5 shrink-0 text-brand" />
        <p>
          iPhone: tap Share, then <b>Add to Home Screen</b>. Android: tap the ⋮ menu, then <b>Add to Home screen</b>. It opens like an app.
        </p>
      </Card>

      <div className="mt-8 flex flex-col gap-2">
        <Button variant="outline" onClick={signOut}>
          <LogOut className="size-4" /> Sign out
        </Button>
        <Button variant="ghost" onClick={signOutEverywhere} className="text-bad">
          Sign out everywhere
        </Button>
      </div>
      <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted">
        <Sparkles className="size-3.5" /> Built by Claude for the Rougeau family
      </p>

      {pinOpen ? (
        <Sheet open onClose={() => setPinOpen(false)}>
          <div className="py-4">
            <SetPin
              onDone={() => {
                setPinOpen(false);
                toast("PIN changed");
              }}
              onCancel={() => setPinOpen(false)}
            />
          </div>
        </Sheet>
      ) : null}

      {editing ? <EditMember m={editing} onClose={() => setEditing(null)} /> : null}

      {tempPin ? (
        <Sheet open onClose={() => setTempPin(null)} title={`${tempPin.name}'s temporary PIN`}>
          <div className="py-4 text-center">
            <div className="num font-display text-5xl font-semibold tracking-[0.2em]">{tempPin.pin}</div>
            <p className="mx-auto mt-4 max-w-xs text-sm text-muted">
              Give this to {tempPin.name}. It works once, then they'll pick their own. It won't be shown again.
            </p>
            <Button className="mt-6" onClick={() => setTempPin(null)}>
              Done
            </Button>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}

function EditMember({ m, onClose }: { m: Member; onClose: () => void }) {
  const { refresh, toast } = useStore();
  const [name, setName] = useState(m.name);
  const [email, setEmail] = useState(m.email);
  const [color, setColor] = useState(m.color);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/members/${m.id}`, { method: "PATCH", body: { name, email, color } });
      toast("Saved");
      refresh();
      onClose();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title={`Edit ${m.name}`}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={40} required />
        </Field>
        <Field label="Email (used to sign in)">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} required />
        </Field>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink-2">Color</span>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={c}
                className={`size-9 rounded-full ring-offset-2 ring-offset-bg ${color === c ? "ring-2 ring-ink" : ""}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        {error ? <p className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-sm text-bad">{error}</p> : null}
        <Button type="submit" className="w-full" busy={busy}>
          Save
        </Button>
      </form>
    </Sheet>
  );
}
