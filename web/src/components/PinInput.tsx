import { useEffect, useRef, useState } from "react";

/** Six PIN boxes backed by one real input, so paste, autofill and the number pad all work. */
export function PinInput({
  value,
  onChange,
  onComplete,
  autoFocus,
  error,
  label = "PIN",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  autoFocus?: boolean;
  error?: boolean;
  label?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  return (
    <div className={`relative ${error ? "anim-shake" : ""}`} onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        aria-label={label}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="current-password"
        maxLength={6}
        disabled={disabled}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 6);
          onChange(v);
          if (v.length === 6) onComplete?.(v);
        }}
        className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
      />
      <div className="grid grid-cols-6 gap-2">
        {Array.from({ length: 6 }, (_, i) => {
          const filled = i < value.length;
          const active = focused && i === Math.min(value.length, 5);
          return (
            <div
              key={i}
              className={`flex aspect-[4/5] items-center justify-center rounded-xl border-2 bg-surface text-2xl transition ${
                error ? "border-bad" : active ? "border-brand" : filled ? "border-ink-2/30" : "border-line"
              }`}
            >
              {filled ? <span className="size-3 rounded-full bg-ink" /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
