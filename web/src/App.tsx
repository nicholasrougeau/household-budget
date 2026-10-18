import { useCallback, useEffect, useState } from "react";
import { House, Landmark, ListChecks, MessagesSquare, Plus, RotateCw } from "lucide-react";
import { onSignedOut, session } from "./lib/api";
import { StoreProvider, useStore } from "./lib/store";
import { Avatar, Button, Mark, Spinner } from "./components/ui";
import { Login } from "./views/Login";
import { SetPin } from "./views/SetPin";
import { Home } from "./views/Home";
import { Feed } from "./views/Feed";
import { EntrySheet } from "./views/EntrySheet";
import { AddSheet } from "./views/AddSheet";
import { Accounts, AccountSheet } from "./views/Accounts";
import { Plan } from "./views/Plan";
import { Settings } from "./views/Settings";

type Phase = "login" | "setpin" | "app";

export default function App() {
  const [phase, setPhase] = useState<Phase>(session.get() ? "app" : "login");
  useEffect(() => onSignedOut(() => setPhase("login")), []);
  const toLogin = useCallback(() => setPhase("login"), []);
  const toSetPin = useCallback(() => setPhase("setpin"), []);

  if (phase === "login") return <Login onDone={(me) => setPhase(me.must_change_pin ? "setpin" : "app")} />;
  if (phase === "setpin") return <SetPin forced onDone={() => setPhase("app")} />;
  return (
    <StoreProvider onMustChangePin={toSetPin} onSignOut={toLogin} splash={(error, retry) => <Splash error={error} retry={retry} />}>
      <Shell />
    </StoreProvider>
  );
}

function Splash({ error, retry }: { error: string | null; retry: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <Mark size={56} />
      {error ? (
        <>
          <p className="max-w-xs text-ink-2">{error}</p>
          <Button variant="soft" onClick={retry}>
            <RotateCw className="size-4" /> Try again
          </Button>
        </>
      ) : (
        <Spinner className="size-6 text-muted" />
      )}
    </div>
  );
}

function useHashRoute() {
  const read = () => {
    const h = location.hash.replace(/^#/, "") || "/";
    const [path, qs] = h.split("?");
    return { path, params: new URLSearchParams(qs ?? "") };
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => {
      setRoute(read());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

const TABS = [
  { path: "/", label: "Home", icon: House },
  { path: "/feed", label: "Feed", icon: MessagesSquare },
  { path: "/accounts", label: "Accounts", icon: Landmark },
  { path: "/plan", label: "Plan", icon: ListChecks },
] as const;

function Shell() {
  const { state, sheet, openSheet, members } = useStore();
  const { path, params } = useHashRoute();
  const unread = state.unread.entries.length + state.unread.comment_entries.length;

  const view =
    path === "/feed" ? (
      <Feed key={params.toString()} params={params} />
    ) : path === "/accounts" ? (
      <Accounts />
    ) : path === "/plan" ? (
      <Plan />
    ) : path === "/settings" ? (
      <Settings />
    ) : (
      <Home />
    );

  const tab = (t: (typeof TABS)[number], compact: boolean) => {
    const active = path === t.path || (t.path === "/" && !TABS.some((x) => x.path === path) && path !== "/settings");
    const Icon = t.icon;
    return (
      <a
        key={t.path}
        href={`#${t.path}`}
        aria-current={active ? "page" : undefined}
        className={
          compact
            ? `relative flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1 text-[11px] font-semibold ${active ? "text-brand" : "text-muted"}`
            : `relative inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold ${active ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-surface-2"}`
        }
      >
        <Icon className={compact ? "size-6" : "size-4"} strokeWidth={active ? 2.3 : 2} />
        {t.label}
        {t.path === "/feed" && unread ? (
          <span className={`absolute flex min-w-[18px] items-center justify-center rounded-full bg-bad px-1 text-[10px] leading-[18px] font-bold text-white ${compact ? "top-1 left-[calc(50%+6px)]" : "-top-1 -right-1"}`}>
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </a>
    );
  };

  return (
    <div className="min-h-dvh">
      <header className="pt-safe sticky top-0 z-30 border-b border-line/70 bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <a href="#/" className="flex items-center gap-2.5">
            <Mark size={30} />
            <span className="font-display text-lg font-semibold tracking-tight">Rougeau Budget</span>
          </a>
          <nav className="ml-6 hidden items-center gap-1 md:flex">{TABS.map((t) => tab(t, false))}</nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden md:block">
              <Button size="sm" onClick={() => openSheet({ type: "add", tab: "expense" })}>
                <Plus className="size-4" /> Log
              </Button>
            </span>
            <a href="#/settings" aria-label="Settings" className="rounded-full ring-offset-2 ring-offset-bg hover:ring-2 hover:ring-line">
              <Avatar who={members.get(state.me.id)} size={34} />
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-28 md:pb-12">{view}</main>

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md md:hidden">
        <div className="mx-auto flex max-w-md items-stretch px-2">
          {tab(TABS[0], true)}
          {tab(TABS[1], true)}
          <div className="flex flex-1 items-start justify-center">
            <button
              onClick={() => openSheet({ type: "add", tab: "expense" })}
              aria-label="Log something"
              className="-mt-5 flex size-14 items-center justify-center rounded-2xl bg-brand text-brand-ink shadow-pop transition active:scale-95"
            >
              <Plus className="size-7" strokeWidth={2.5} />
            </button>
          </div>
          {tab(TABS[2], true)}
          {tab(TABS[3], true)}
        </div>
      </nav>

      {sheet?.type === "entry" ? <EntrySheet key={sheet.id} id={sheet.id} /> : null}
      {sheet?.type === "add" ? <AddSheet key={sheet.entry?.id ?? sheet.tab ?? "new"} tab={sheet.tab} entry={sheet.entry} preset={sheet.preset} /> : null}
      {sheet?.type === "account" ? <AccountSheet key={sheet.id} id={sheet.id} /> : null}
      {sheet?.type === "account-new" ? <AccountSheet /> : null}
    </div>
  );
}
