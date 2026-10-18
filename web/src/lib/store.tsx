import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError, session } from "./api";
import { latestBalances } from "./budget";
import type { Account, AppState, Balance, Category, Entry, Member } from "./types";

export type AddTab = "expense" | "income" | "transfer" | "balances";

export type SheetState =
  | { type: "entry"; id: string }
  | { type: "add"; tab?: AddTab; entry?: Entry; preset?: Partial<Entry> }
  | { type: "account"; id: string }
  | { type: "account-new" }
  | null;

type Toast = { id: number; text: string; tone: "ok" | "error" };

type Store = {
  state: AppState;
  version: number;
  refresh: () => void;
  reloadState: () => Promise<void>;
  members: Map<string, Member>;
  accounts: Map<string, Account>;
  categories: Map<string, Category>;
  latest: Map<string, Balance>;
  toast: (text: string, tone?: "ok" | "error") => void;
  sheet: SheetState;
  openSheet: (s: Exclude<SheetState, null>) => void;
  closeSheet: () => void;
  signOut: () => void;
};

const Ctx = createContext<Store | null>(null);

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside provider");
  return s;
}

export function StoreProvider({
  children,
  onMustChangePin,
  onSignOut,
  splash,
}: {
  children: ReactNode;
  onMustChangePin: () => void;
  onSignOut: () => void;
  splash: (error: string | null, retry: () => void) => ReactNode;
}) {
  const [state, setState] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sheet, setSheet] = useState<SheetState>(null);
  const pushedRef = useRef(false);

  const reloadState = useCallback(async () => {
    try {
      const s = await api<AppState>("/state");
      setState(s);
      setLoadError(null);
    } catch (e) {
      if (e instanceof ApiError && e.code === "must_change_pin") onMustChangePin();
      else if (e instanceof ApiError && e.code !== "signed_out") setLoadError(e.message);
      throw e;
    }
  }, [onMustChangePin]);

  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
    reloadState().catch(() => {});
  }, [reloadState]);

  useEffect(() => {
    reloadState().catch(() => {});
  }, [reloadState]);

  // Pick up the other person's changes when the app comes back into view, and once a minute.
  useEffect(() => {
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    const id = window.setInterval(() => document.visibilityState === "visible" && refresh(), 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(id);
    };
  }, [refresh]);

  const toast = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 5000 : 2600);
  }, []);

  // Sheets push a history entry so the phone's back gesture closes them.
  const openSheet = useCallback((s: Exclude<SheetState, null>) => {
    setSheet(s);
    if (!pushedRef.current) {
      history.pushState({ sheet: true }, "");
      pushedRef.current = true;
    }
  }, []);
  const closeSheet = useCallback(() => {
    if (pushedRef.current) {
      pushedRef.current = false;
      history.back();
    }
    setSheet(null);
  }, []);
  useEffect(() => {
    const onPop = () => {
      if (pushedRef.current) {
        pushedRef.current = false;
        setSheet(null);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const signOut = useCallback(() => {
    session.set(null);
    onSignOut();
  }, [onSignOut]);

  const value = useMemo<Store | null>(() => {
    if (!state) return null;
    return {
      state,
      version,
      refresh,
      reloadState,
      members: new Map(state.members.map((m) => [m.id, m])),
      accounts: new Map(state.accounts.map((a) => [a.id, a])),
      categories: new Map(state.categories.map((c) => [c.id, c])),
      latest: latestBalances(state.balances),
      toast,
      sheet,
      openSheet,
      closeSheet,
      signOut,
    };
  }, [state, version, refresh, reloadState, toast, sheet, openSheet, closeSheet, signOut]);

  if (!value) return <>{splash(loadError, () => reloadState().catch(() => {}))}</>;

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex flex-col items-center gap-2 px-4 pt-[max(env(safe-area-inset-top),12px)]">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`anim-sheet pointer-events-auto rounded-full px-4 py-2 text-sm font-medium shadow-pop ${
              t.tone === "error" ? "bg-bad text-white" : "bg-ink text-bg"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

/** Fetches entries for a query and refetches whenever anything is saved (store.version). */
export function useEntries(query: string | null) {
  const { version } = useStore();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (query === null) return;
    let live = true;
    api<{ entries: Entry[] }>(`/entries?${query}`)
      .then((r) => {
        if (!live) return;
        setEntries(r.entries.map((e) => ({ ...e, amount: Number(e.amount) })));
        setError(null);
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [query, version]);
  return { entries, error };
}
