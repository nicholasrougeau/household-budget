import { useEffect, useMemo, useRef, useState } from "react";
import { Inbox, Landmark, Search, X } from "lucide-react";
import { api } from "../lib/api";
import { useEntries, useStore } from "../lib/store";
import { dayLabel, isoDay, money, monthBounds, monthLabel, relTime } from "../lib/format";
import type { Balance, Checkin, Entry } from "../lib/types";
import { Avatar, Card, Chip, Empty, Spinner } from "../components/ui";
import { EntryRow } from "../components/EntryRow";

type Filter = "all" | "claude" | "flagged" | "one_time" | "unmatched" | string;

type Item =
  | { type: "entry"; day: string; at: string; e: Entry }
  | { type: "balances"; day: string; at: string; who: string | null; items: Balance[] }
  | { type: "checkin"; day: string; at: string; c: Checkin };

const PAGE = 60;

export function Feed({ params }: { params: URLSearchParams }) {
  const { state, members, accounts, categories, reloadState } = useStore();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [pages, setPages] = useState(1);
  const categoryId = params.get("category");
  const month = params.get("month");
  const accountId = params.get("account");
  const category = categoryId ? categories.get(categoryId) : undefined;
  const account = accountId ? accounts.get(accountId) : undefined;

  // Snapshot what was new when the feed opened, then mark it seen.
  const [unread] = useState(() => ({
    entries: new Set(state.unread.entries),
    comments: new Set(state.unread.comment_entries),
  }));
  const marked = useRef(false);
  useEffect(() => {
    if (marked.current || (!unread.entries.size && !unread.comments.size)) return;
    marked.current = true;
    const t = window.setTimeout(() => {
      api("/seen", { method: "POST" }).then(() => reloadState()).catch(() => {});
    }, 1500);
    return () => window.clearTimeout(t);
  }, [unread, reloadState]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", String(PAGE * pages));
    if (filter === "claude") p.set("who", "claude");
    else if (filter === "flagged") p.set("flagged", "1");
    else if (filter === "one_time") p.set("one_time", "1");
    else if (filter === "unmatched") p.set("unverified", "1");
    else if (filter !== "all") p.set("who", filter);
    if (debounced) p.set("q", debounced);
    if (categoryId) p.set("category_id", categoryId);
    if (accountId) p.set("account_id", accountId);
    if (month) {
      const b = monthBounds(month);
      p.set("from", b.from);
      p.set("to", b.to);
    }
    return p.toString();
  }, [filter, debounced, categoryId, accountId, month, pages]);

  const { entries, error } = useEntries(query);

  const items = useMemo<Item[]>(() => {
    if (!entries) return [];
    const out: Item[] = entries.map((e) => ({ type: "entry", day: e.occurred_on, at: e.created_at, e }));
    const plain = !debounced && !categoryId && !accountId && (filter === "all" || members.has(filter));
    if (plain && entries.length) {
      const oldest = entries[entries.length - 1].occurred_on;
      const inRange = (d: string) => d >= oldest && (!month || d.startsWith(month));
      // Group balance updates saved together (same person, within two minutes).
      const groups: { who: string | null; at: string; items: Balance[] }[] = [];
      for (const b of state.balances) {
        if (b.source !== "manual" || !inRange(b.as_of)) continue;
        if (filter !== "all" && b.created_by !== filter) continue;
        const g = groups.find(
          (x) => x.who === b.created_by && Math.abs(new Date(x.at).getTime() - new Date(b.created_at).getTime()) < 120_000
        );
        if (g) g.items.push(b);
        else groups.push({ who: b.created_by, at: b.created_at, items: [b] });
      }
      for (const g of groups) out.push({ type: "balances", day: g.items[0].as_of, at: g.at, who: g.who, items: g.items });
      if (filter === "all")
        for (const c of state.checkins) {
          const d = isoDay(new Date(c.created_at));
          if (inRange(d)) out.push({ type: "checkin", day: d, at: c.created_at, c });
        }
    }
    return out.sort((a, b) => (a.day === b.day ? b.at.localeCompare(a.at) : b.day.localeCompare(a.day)));
  }, [entries, state.balances, state.checkins, debounced, categoryId, filter, members, month]);

  const days = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of items) {
      const list = m.get(it.day) ?? [];
      list.push(it);
      m.set(it.day, list);
    }
    return [...m.entries()];
  }, [items]);

  const newCount = unread.entries.size + unread.comments.size;
  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "Everything" },
    ...state.members.map((m) => ({ id: m.id, label: m.name })),
    { id: "claude", label: "Claude" },
    { id: "flagged", label: "To talk about" },
    { id: "unmatched", label: "Not matched yet" },
  ];

  return (
    <div className="pb-8">
      <h1 className="pt-2 font-display text-[28px] font-semibold tracking-tight">Feed</h1>
      <p className="text-sm text-muted">Everything you two log, plus what Claude adds from statements.</p>

      {newCount ? (
        <div className="mt-4 rounded-2xl bg-brand-soft px-4 py-3 text-sm font-medium text-brand">
          {[
            unread.entries.size ? `${unread.entries.size} new entr${unread.entries.size === 1 ? "y" : "ies"}` : "",
            unread.comments.size ? `new comments on ${unread.comments.size}` : "",
          ]
            .filter(Boolean)
            .join(" and ")}{" "}
          since you last looked.
        </div>
      ) : null}

      <div className="relative mt-4">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPages(1);
          }}
          placeholder="Search entries and notes"
          className="h-11 w-full rounded-xl border border-line bg-surface pr-10 pl-10 outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
        />
        {q ? (
          <button onClick={() => setQ("")} aria-label="Clear search" className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-surface-2">
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        {filters.map((f) => (
          <Chip
            key={f.id}
            active={filter === f.id}
            onClick={() => {
              setFilter(f.id);
              setPages(1);
            }}
          >
            {f.label}
          </Chip>
        ))}
      </div>

      {category || month || account ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Showing</span>
          {category ? <span className="rounded-full bg-surface-2 px-2.5 py-1 font-medium">{category.name}</span> : null}
          {account ? <span className="rounded-full bg-surface-2 px-2.5 py-1 font-medium">{account.name}</span> : null}
          {month ? <span className="rounded-full bg-surface-2 px-2.5 py-1 font-medium">{monthLabel(month)}</span> : null}
          <a href="#/feed" className="inline-flex items-center gap-1 font-medium text-brand">
            <X className="size-3.5" /> Clear
          </a>
        </div>
      ) : null}

      {error ? <p className="mt-4 rounded-xl bg-bad-soft p-3 text-sm text-bad">{error}</p> : null}

      {!entries ? (
        <div className="flex justify-center py-20 text-muted">
          <Spinner />
        </div>
      ) : !items.length ? (
        <Empty icon={<Inbox className="size-6" />} title="Nothing here yet" body="Tap the + button to log an expense, a paycheck or today's balances." />
      ) : (
        <div className="mt-2">
          {days.map(([day, list]) => {
            const spent = list.reduce((s, it) => s + (it.type === "entry" && it.e.kind === "expense" ? Number(it.e.amount) : 0), 0);
            return (
              <section key={day}>
                <div className="sticky top-[calc(env(safe-area-inset-top)+56px)] z-10 -mx-1 flex items-baseline justify-between bg-bg/95 px-2 pt-5 pb-2 backdrop-blur">
                  <h2 className="text-sm font-semibold text-ink-2">{dayLabel(day)}</h2>
                  {spent ? <span className="num text-xs text-muted">{money(spent)} spent</span> : null}
                </div>
                <Card className="divide-y divide-line overflow-hidden">
                  {list.map((it) =>
                    it.type === "entry" ? (
                      <EntryRow key={it.e.id} e={it.e} unread={unread.entries.has(it.e.id) || unread.comments.has(it.e.id)} />
                    ) : it.type === "balances" ? (
                      <div key={"b" + it.at} className="flex items-start gap-3 px-4 py-3">
                        <span className="relative">
                          <Avatar who={it.who ? members.get(it.who) : "claude"} size={36} />
                          <span className="absolute -right-1 -bottom-1 flex size-[18px] items-center justify-center rounded-full border-2 border-surface bg-surface-2 text-ink-2">
                            <Landmark className="size-2.5" />
                          </span>
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">
                            {it.who ? members.get(it.who)?.name : "Claude"} updated {it.items.length === 1 ? "a balance" : `${it.items.length} balances`}
                          </div>
                          <div className="mt-0.5 space-y-0.5 text-[13px] text-muted">
                            {it.items.map((b) => (
                              <div key={b.id} className="flex justify-between gap-3">
                                <span className="truncate">{accounts.get(b.account_id)?.name}</span>
                                <span className="num text-ink-2">{money(Number(b.amount))}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div key={it.c.id} className="flex items-start gap-3 px-4 py-3">
                        <Avatar who="claude" size={36} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-medium">{it.c.title}</span>
                            <span className="shrink-0 text-xs text-muted">{relTime(it.c.created_at)}</span>
                          </div>
                          <p className="mt-1 line-clamp-4 text-[13px] whitespace-pre-line text-ink-2">{it.c.body}</p>
                        </div>
                      </div>
                    )
                  )}
                </Card>
              </section>
            );
          })}
          {entries.length >= PAGE * pages ? (
            <div className="mt-5 flex justify-center">
              <button onClick={() => setPages((p) => p + 1)} className="h-10 rounded-full border border-line bg-surface px-5 text-sm font-semibold hover:bg-surface-2">
                Show more
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
