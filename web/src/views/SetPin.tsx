import { useState } from "react";
import { api, ApiError, session } from "../lib/api";
import { PinInput } from "../components/PinInput";
import { Button, Mark } from "../components/ui";

/** Forced on first sign-in (temporary PIN), and reused from Settings to change a PIN. */
export function SetPin({ forced, onDone, onCancel }: { forced?: boolean; onDone: () => void; onCancel?: () => void }) {
  const [step, setStep] = useState<"current" | "new" | "confirm">(forced ? "new" : "current");
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  const fail = (msg: string) => {
    setError(msg);
    setShake((s) => s + 1);
  };

  async function save(c: string) {
    if (c !== pin) {
      setConfirm("");
      return fail("Those don't match. Enter the new PIN again.");
    }
    setBusy(true);
    try {
      const r = await api<{ token: string }>("/auth/pin", { method: "POST", body: { pin, current } });
      session.set(r.token);
      onDone();
    } catch (e) {
      const err = e as ApiError;
      if (err.code === "wrong_current") {
        setStep("current");
        setCurrent("");
        setPin("");
        setConfirm("");
      } else {
        setStep("new");
        setPin("");
        setConfirm("");
      }
      fail(err.message);
    } finally {
      setBusy(false);
    }
  }

  const title = {
    current: "Enter your current PIN",
    new: forced ? "Pick your own PIN" : "Pick a new PIN",
    confirm: "Enter it once more",
  }[step];
  const body = {
    current: "So we know it's you.",
    new: forced
      ? "You signed in with a temporary PIN. Choose 6 digits only you know. It also signs out any other devices."
      : "6 digits. Changing it signs you out on your other devices.",
    confirm: "Just to be sure.",
  }[step];

  return (
    <div className={forced ? "pt-safe flex min-h-dvh flex-col items-center justify-center px-6 py-10" : ""}>
      <div className="mx-auto w-full max-w-sm">
        {forced ? (
          <div className="mb-6 flex justify-center">
            <Mark size={52} />
          </div>
        ) : null}
        <h1 className={`text-center font-display font-semibold tracking-tight ${forced ? "text-2xl" : "text-xl"}`}>{title}</h1>
        <p className="mx-auto mt-1.5 mb-6 max-w-xs text-center text-sm text-muted">{body}</p>
        {step === "current" ? (
          <PinInput
            key={"c" + shake}
            label="Current PIN"
            value={current}
            onChange={(v) => {
              setCurrent(v);
              setError(null);
            }}
            onComplete={() => setStep("new")}
            autoFocus
            error={!!error}
          />
        ) : step === "new" ? (
          <PinInput
            key={"n" + shake}
            label="New PIN"
            value={pin}
            onChange={(v) => {
              setPin(v);
              setError(null);
            }}
            onComplete={() => setStep("confirm")}
            autoFocus
            error={!!error}
          />
        ) : (
          <PinInput
            key={"f" + shake}
            label="Confirm new PIN"
            value={confirm}
            onChange={(v) => {
              setConfirm(v);
              setError(null);
            }}
            onComplete={save}
            autoFocus
            error={!!error}
            disabled={busy}
          />
        )}
        {error ? (
          <p role="alert" className="mt-4 rounded-xl bg-bad-soft px-3.5 py-2.5 text-center text-sm font-medium text-bad">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex justify-center gap-2">
          {step !== (forced ? "new" : "current") ? (
            <Button
              variant="ghost"
              onClick={() => {
                setError(null);
                setConfirm("");
                setPin("");
                setStep(step === "confirm" ? "new" : "current");
              }}
            >
              Back
            </Button>
          ) : null}
          {onCancel ? (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          {forced ? (
            <Button
              variant="ghost"
              onClick={() => {
                session.set(null);
                location.reload();
              }}
            >
              Sign out
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
