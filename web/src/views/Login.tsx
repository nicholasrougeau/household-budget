import { useState } from "react";
import { Lock } from "lucide-react";
import { api, ApiError, session } from "../lib/api";
import type { Me } from "../lib/types";
import { PinInput } from "../components/PinInput";
import { Button, inputCls, Mark } from "../components/ui";

function minutes(sec: number) {
  const m = Math.ceil(sec / 60);
  return m >= 60 ? `${Math.round(m / 60)} hour${m >= 90 ? "s" : ""}` : `${m} minute${m === 1 ? "" : "s"}`;
}

export function Login({ onDone }: { onDone: (me: Me) => void }) {
  const [email, setEmail] = useState(session.email());
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);

  async function submit(p = pin) {
    if (!email.trim() || p.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string; me: Me }>("/auth/login", { method: "POST", body: { email: email.trim(), pin: p } });
      session.set(r.token);
      session.rememberEmail(email.trim());
      onDone(r.me);
    } catch (e) {
      const err = e as ApiError;
      const left = err.data?.tries_left as number | undefined;
      const wait = err.data?.retry_after as number | undefined;
      if (err.code === "locked" && wait) setError(`Too many wrong PINs. Try again in ${minutes(wait)}.`);
      else if (err.code === "invalid" && left !== undefined && left <= 3)
        setError(`That email and PIN don't match. ${left} ${left === 1 ? "try" : "tries"} left before a 15-minute lock.`);
      else setError(err.message);
      setPin("");
      setShake((s) => s + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="pt-safe flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Mark size={64} />
          <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight">Rougeau Budget</h1>
          <p className="mt-1.5 text-muted">Nick and Meghan's money, in one place.</p>
        </div>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-2">Email</span>
            <input
              type="email"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              placeholder="you@gmail.com"
            />
          </label>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink-2">6-digit PIN</span>
            <PinInput
              key={shake}
              value={pin}
              onChange={setPin}
              onComplete={(v) => submit(v)}
              autoFocus={!!email}
              error={!!error}
              disabled={busy}
            />
          </div>
          {error ? (
            <p role="alert" className="rounded-xl bg-bad-soft px-3.5 py-2.5 text-sm font-medium text-bad">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="lg" className="w-full" busy={busy} disabled={pin.length !== 6 || !email.trim()}>
            Sign in
          </Button>
        </form>
        <p className="mt-8 flex items-center justify-center gap-1.5 text-center text-xs text-muted">
          <Lock className="size-3.5" /> Locks for 15 minutes after 5 wrong PINs.
        </p>
      </div>
    </main>
  );
}
