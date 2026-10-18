import { ArrowRight, CircleCheck, Flag, MessageCircle } from "lucide-react";
import { useStore } from "../lib/store";
import { money } from "../lib/format";
import type { Entry } from "../lib/types";
import { Avatar, CategoryIcon } from "./ui";

export function entryAmountClass(e: Entry) {
  if (e.kind === "income" || e.kind === "refund") return "text-good";
  if (e.kind === "transfer") return "text-muted";
  return "text-ink";
}

export function entryAmountText(e: Entry) {
  const v = Number(e.amount);
  if (e.kind === "income" || e.kind === "refund") return "+" + money(v);
  return money(v);
}

export function useEntryLabels(e: Entry) {
  const { categories, accounts, members } = useStore();
  const cat = e.category_id ? categories.get(e.category_id) : undefined;
  const from = e.account_id ? accounts.get(e.account_id) : undefined;
  const to = e.to_account_id ? accounts.get(e.to_account_id) : undefined;
  const who = e.created_by ? members.get(e.created_by) : ("claude" as const);
  return { cat, from, to, who };
}

export function EntryRow({ e, unread, showAvatar = true }: { e: Entry; unread?: boolean; showAvatar?: boolean }) {
  const { openSheet } = useStore();
  const { cat, from, to, who } = useEntryLabels(e);
  const sub =
    e.kind === "transfer" ? (
      <span className="inline-flex items-center gap-1">
        {from?.name ?? "Another account"} <ArrowRight className="size-3" /> {to?.name ?? "?"}
      </span>
    ) : (
      [cat?.name ?? (e.kind === "income" ? "Income" : "Uncategorized"), from?.name].filter(Boolean).join(" · ")
    );
  return (
    <button
      onClick={() => openSheet({ type: "entry", id: e.id })}
      className={`group flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2 ${unread ? "bg-brand-soft/60" : ""}`}
    >
      {showAvatar ? (
        <span className="relative">
          <Avatar who={who} size={36} />
          <span className="absolute -right-1 -bottom-1 flex size-[18px] items-center justify-center rounded-full border-2 border-surface bg-surface-2 text-ink-2">
            <CategoryIcon icon={e.kind === "transfer" ? "transfer" : cat?.icon} className="size-2.5" />
          </span>
        </span>
      ) : (
        <span className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-ink-2">
          <CategoryIcon icon={e.kind === "transfer" ? "transfer" : cat?.icon} className="size-4" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {unread ? <span className="size-2 shrink-0 rounded-full bg-brand" aria-label="New" /> : null}
          <span className="truncate font-medium">{e.title}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-[13px] text-muted">
          <span className="truncate">{sub}</span>
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className={`num font-semibold ${entryAmountClass(e)}`}>{entryAmountText(e)}</span>
        <span className="flex items-center gap-1.5 text-muted">
          {e.one_time ? (
            <span className="rounded-full bg-warn-soft px-1.5 py-px text-[11px] font-semibold text-warn">One-time</span>
          ) : null}
          {e.flagged ? <Flag className="size-3.5 text-bad" aria-label="Flagged to talk about" /> : null}
          {e.comment_count ? (
            <span className="inline-flex items-center gap-0.5 text-xs font-medium text-ink-2">
              <MessageCircle className="size-3.5" /> {e.comment_count}
            </span>
          ) : null}
          {e.verified ? <CircleCheck className="size-3.5 text-good" aria-label="Matched to a statement" /> : null}
        </span>
      </span>
    </button>
  );
}
