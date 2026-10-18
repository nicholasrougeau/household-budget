import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, CircleCheck, CircleDashed, Flag, Pencil, Send, Trash } from "lucide-react";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import { relTime, shortDate, timeOfDay } from "../lib/format";
import type { Comment, Entry } from "../lib/types";
import { Avatar, Button, CategoryIcon, Sheet, Spinner } from "../components/ui";
import { entryAmountClass, entryAmountText } from "../components/EntryRow";

const KIND_LABEL = { expense: "Expense", income: "Money in", transfer: "Moved money", refund: "Refund" } as const;
const SOURCE_LABEL = { manual: "", statement: "from a statement", email: "from an email", claude: "" } as const;

export function EntrySheet({ id }: { id: string }) {
  const { members, accounts, categories, state, closeSheet, openSheet, refresh, toast } = useStore();
  const [data, setData] = useState<{ entry: Entry; comments: Comment[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    api<{ entry: Entry; comments: Comment[] }>(`/entries/${id}`)
      .then((r) => live && setData(r))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [id]);

  useEffect(() => {
    listEnd.current?.scrollIntoView({ block: "nearest" });
  }, [data?.comments.length]);

  const e = data?.entry;
  const cat = e?.category_id ? categories.get(e.category_id) : undefined;
  const from = e?.account_id ? accounts.get(e.account_id) : undefined;
  const to = e?.to_account_id ? accounts.get(e.to_account_id) : undefined;
  const who = e ? (e.created_by ? members.get(e.created_by) : ("claude" as const)) : undefined;
  const editor = e?.updated_by && e.updated_by !== e.created_by ? members.get(e.updated_by) : undefined;

  async function send() {
    const body = draft.trim();
    if (!body || !e) return;
    setSending(true);
    try {
      const r = await api<{ comment: Comment }>(`/entries/${e.id}/comments`, { method: "POST", body: { body } });
      setData((d) => (d ? { ...d, comments: [...d.comments, r.comment] } : d));
      setDraft("");
      refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setSending(false);
    }
  }

  async function toggleFlag() {
    if (!e) return;
    try {
      const r = await api<{ entry: Entry }>(`/entries/${e.id}`, { method: "PATCH", body: { flagged: !e.flagged } });
      setData((d) => (d ? { ...d, entry: r.entry } : d));
      refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function remove() {
    if (!e || !window.confirm(`Delete "${e.title}"? Comments on it go too.`)) return;
    try {
      await api(`/entries/${e.id}`, { method: "DELETE" });
      toast("Deleted");
      refresh();
      closeSheet();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  async function removeComment(c: Comment) {
    if (!window.confirm("Delete your comment?")) return;
    try {
      await api(`/comments/${c.id}`, { method: "DELETE" });
      setData((d) => (d ? { ...d, comments: d.comments.filter((x) => x.id !== c.id) } : d));
      refresh();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  return (
    <Sheet
      open
      onClose={closeSheet}
      title={e ? KIND_LABEL[e.kind] : ""}
      footer={
        e ? (
          <form
            className="flex items-end gap-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              send();
            }}
          >
            <Avatar who={members.get(state.me.id)} size={32} />
            <textarea
              value={draft}
              onChange={(ev) => setDraft(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" && !ev.shiftKey && window.matchMedia("(hover: hover)").matches) {
                  ev.preventDefault();
                  send();
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder="Add a comment"
              className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl border border-line bg-surface px-3.5 py-2 outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
            />
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              aria-label="Send comment"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-brand-ink transition disabled:opacity-40"
            >
              {sending ? <Spinner className="size-4" /> : <Send className="size-4" />}
            </button>
          </form>
        ) : null
      }
    >
      {error ? <p className="rounded-xl bg-bad-soft p-3 text-sm text-bad">{error}</p> : null}
      {!e ? (
        !error ? (
          <div className="flex justify-center py-16 text-muted">
            <Spinner />
          </div>
        ) : null
      ) : (
        <div>
          <div className="flex flex-col items-center pt-2 pb-5 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-ink-2">
              <CategoryIcon icon={e.kind === "transfer" ? "transfer" : cat?.icon} className="size-6" />
            </span>
            <div className={`num mt-3 font-display text-[40px] leading-none font-semibold tracking-tight ${entryAmountClass(e)}`}>
              {entryAmountText(e)}
            </div>
            <div className="mt-2 text-lg font-medium">{e.title}</div>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              {e.one_time ? <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-semibold text-warn">One-time</span> : null}
              {e.flagged ? <span className="rounded-full bg-bad-soft px-2.5 py-0.5 text-xs font-semibold text-bad">To talk about</span> : null}
            </div>
          </div>

          <dl className="divide-y divide-line rounded-2xl border border-line bg-surface text-[15px]">
            {e.kind !== "transfer" ? <Row label="Category" value={cat?.name ?? "Uncategorized"} /> : null}
            {e.kind === "transfer" ? (
              <Row
                label="From → to"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    {from?.name ?? "Another account"} <ArrowRight className="size-3.5 text-muted" /> {to?.name ?? "?"}
                  </span>
                }
              />
            ) : (
              <Row label={e.kind === "income" ? "Went into" : "Paid with"} value={from?.name ?? "Not set"} />
            )}
            <Row label="Date" value={shortDate(e.occurred_on, true)} />
            <Row
              label="Logged by"
              value={
                <span className="inline-flex items-center gap-2">
                  <Avatar who={who} size={22} />
                  {who === "claude" ? `Claude ${SOURCE_LABEL[e.source]}`.trim() : who?.name}
                  <span className="text-muted">· {relTime(e.created_at)}</span>
                </span>
              }
            />
            {editor ? <Row label="Last edited" value={`${editor.name} · ${relTime(e.updated_at)}`} /> : null}
            <Row
              label="Statement"
              value={
                e.verified ? (
                  <span className="inline-flex items-start gap-1.5 text-good">
                    <CircleCheck className="mt-0.5 size-4 shrink-0" />
                    <span>
                      Matched{e.verified_ref ? <span className="block text-sm text-muted">{e.verified_ref}</span> : null}
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-muted">
                    <CircleDashed className="size-4" /> Not matched yet
                  </span>
                )
              }
            />
            {e.note ? <Row label="Note" value={<span className="whitespace-pre-line">{e.note}</span>} /> : null}
          </dl>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button variant="outline" onClick={() => openSheet({ type: "add", entry: e })}>
              <Pencil className="size-4" /> Edit
            </Button>
            <Button variant={e.flagged ? "danger" : "outline"} onClick={toggleFlag}>
              <Flag className="size-4" /> {e.flagged ? "Flagged" : "Flag"}
            </Button>
            <Button variant="outline" onClick={remove} className="text-bad">
              <Trash className="size-4" /> Delete
            </Button>
          </div>

          <h3 className="mt-6 mb-2 text-[13px] font-semibold tracking-wide text-muted uppercase">
            Comments{data.comments.length ? ` · ${data.comments.length}` : ""}
          </h3>
          {data.comments.length ? (
            <ul className="space-y-3">
              {data.comments.map((c) => {
                const author = c.author_id ? members.get(c.author_id) : ("claude" as const);
                const mine = c.author_id === state.me.id;
                return (
                  <li key={c.id} className="flex gap-2.5">
                    <Avatar who={author} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 text-sm">
                        <span className="font-semibold">{author === "claude" ? "Claude" : author?.name}</span>
                        <span className="text-muted" title={new Date(c.created_at).toLocaleString()}>
                          {relTime(c.created_at)} · {timeOfDay(c.created_at)}
                        </span>
                        {mine ? (
                          <button onClick={() => removeComment(c)} className="ml-auto text-xs text-muted hover:text-bad">
                            Delete
                          </button>
                        ) : null}
                      </div>
                      <p className="mt-1 rounded-2xl rounded-tl-md bg-surface px-3.5 py-2 text-[15px] whitespace-pre-line shadow-card">
                        {c.body}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted">
              No comments yet. Ask a question, explain it, or say thanks for the date night.
            </p>
          )}
          <div ref={listEnd} />
        </div>
      )}
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{value}</dd>
    </div>
  );
}
