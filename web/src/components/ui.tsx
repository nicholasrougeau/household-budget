import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import {
  ArrowLeftRight, Banknote, Baby, Briefcase, Car, Church, Cigarette, Coffee, CreditCard, Droplet, Flame, Fuel, Gift,
  HandCoins, Heart, HeartHandshake, HeartPulse, House, Landmark, Percent, PiggyBank, Plane, Receipt, Repeat, Shield,
  ShieldCheck, ShoppingBag, ShoppingCart, Smartphone, Sparkles, Tag, Ticket, Undo2, UtensilsCrossed, Wallet, Wifi, Wine,
  Wrench, X, Zap, type LucideIcon,
} from "lucide-react";
import type { Member } from "../lib/types";
import { initials, money } from "../lib/format";

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  house: House, zap: Zap, droplet: Droplet, flame: Flame, smartphone: Smartphone, wifi: Wifi, car: Car,
  shield: Shield, "shield-check": ShieldCheck, "heart-handshake": HeartHandshake, repeat: Repeat,
  "shopping-cart": ShoppingCart, fuel: Fuel, wrench: Wrench, heart: Heart, utensils: UtensilsCrossed, coffee: Coffee,
  ticket: Ticket, wine: Wine, cigarette: Cigarette, "shopping-bag": ShoppingBag, "heart-pulse": HeartPulse, gift: Gift,
  "credit-card": CreditCard, percent: Percent, banknote: Banknote, plane: Plane, sparkles: Sparkles,
  briefcase: Briefcase, undo: Undo2, "hand-coins": HandCoins, baby: Baby, church: Church, receipt: Receipt, tag: Tag,
  landmark: Landmark, "piggy-bank": PiggyBank, wallet: Wallet, transfer: ArrowLeftRight,
};

export function CategoryIcon({ icon, className = "size-4" }: { icon?: string | null; className?: string }) {
  const I = (icon && CATEGORY_ICONS[icon]) || Tag;
  return <I className={className} strokeWidth={2} aria-hidden />;
}

export const CLAUDE_COLOR = "#C2653A";

/** who: a member, "claude", or undefined (unknown). */
export function Avatar({ who, size = 32 }: { who: Member | "claude" | undefined; size?: number }) {
  const isClaude = who === "claude";
  const color = isClaude ? CLAUDE_COLOR : who?.color ?? "#7a817d";
  const label = isClaude ? "Claude" : who?.name ?? "Someone";
  return (
    <span
      title={label}
      aria-label={label}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none"
      style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}
    >
      {isClaude ? <Sparkles style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={2.2} /> : initials(label)}
    </span>
  );
}

export function Money({
  value,
  className = "",
  whole,
  sign,
}: {
  value: number;
  className?: string;
  whole?: boolean;
  sign?: boolean;
}) {
  return <span className={`num ${className}`}>{money(value, { whole, sign })}</span>;
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "soft" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
  busy?: boolean;
};

export function Button({ variant = "primary", size = "md", busy, className = "", children, disabled, ...rest }: BtnProps) {
  const v = {
    primary: "bg-brand text-brand-ink hover:bg-brand-2 shadow-card",
    soft: "bg-brand-soft text-brand hover:brightness-95",
    ghost: "text-ink-2 hover:bg-surface-2",
    danger: "bg-bad-soft text-bad hover:brightness-95",
    outline: "border border-line bg-surface text-ink hover:bg-surface-2",
  }[variant];
  const s = { sm: "h-8 px-3 text-sm rounded-lg", md: "h-11 px-4 rounded-xl", lg: "h-13 px-5 text-[17px] rounded-2xl" }[size];
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 ${v} ${s} ${className}`}
    >
      {busy ? <Spinner className="size-4" /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className = "size-5" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-surface shadow-card ${className}`}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-7 flex items-end justify-between px-1">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{children}</h2>
      {action}
    </div>
  );
}

export function Progress({ value, max, tone }: { value: number; max: number; tone?: "good" | "warn" | "bad" | "brand" }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : value > 0 ? 100 : 0;
  const auto = max <= 0 ? (value > 0 ? "bad" : "good") : value > max ? "bad" : value > max * 0.85 ? "warn" : "good";
  const t = tone ?? auto;
  const color = { good: "bg-good", warn: "bg-warn", bad: "bg-bad", brand: "bg-brand" }[t];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(pct)}>
      <div className={`h-full rounded-full ${color} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
  className = "",
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition active:scale-[0.97] ${
        active ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-xl bg-surface-2 p-1" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-9 flex-1 rounded-lg text-sm font-semibold transition ${
            value === o.value ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink-2"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left"
    >
      <span className="flex-1">
        <span className="block font-medium">{label}</span>
        {hint ? <span className="block text-sm text-muted">{hint}</span> : null}
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? "bg-brand" : "bg-surface-3"}`}>
        <span
          className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-2">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-sm text-muted">{hint}</span> : null}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 outline-none transition placeholder:text-muted/70 focus:border-brand focus:ring-4 focus:ring-brand/15";

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal>
      <button aria-label="Close" className="anim-fade absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panel}
        className={`anim-sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-bg shadow-pop sm:rounded-3xl ${
          wide ? "sm:max-w-2xl" : "sm:max-w-lg"
        }`}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-surface-3 sm:hidden" />
        <div className="flex items-center gap-3 px-5 pb-2 pt-3">
          <div className="min-w-0 flex-1 text-lg font-semibold">{title}</div>
          <button
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-ink-2 hover:bg-surface-3"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
        {footer ? <div className="pb-safe border-t border-line bg-bg px-5 pt-3 [&]:pb-[max(env(safe-area-inset-bottom),16px)]">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">{icon}</div>
      <div className="font-semibold">{title}</div>
      {body ? <p className="mt-1 max-w-xs text-sm text-muted">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Mark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="15" fill="#1F5C4D" />
      <path d="M13.5 31.5 32 16l18.5 15.5" fill="none" stroke="#F7F1E3" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19.5 28.5V45a4 4 0 0 0 4 4h17a4 4 0 0 0 4-4V28.5" fill="none" stroke="#F7F1E3" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="38.5" r="5.75" fill="#E8B649" />
    </svg>
  );
}
