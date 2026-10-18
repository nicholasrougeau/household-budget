const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
const TOKEN_KEY = "rb.session";
const EMAIL_KEY = "rb.email";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const session = {
  get: () => storage()?.getItem(TOKEN_KEY) ?? null,
  set: (t: string | null) => {
    try {
      if (t) storage()?.setItem(TOKEN_KEY, t);
      else storage()?.removeItem(TOKEN_KEY);
    } catch {
      /* private mode: session lasts for this tab only */
    }
  },
  email: () => storage()?.getItem(EMAIL_KEY) ?? "",
  rememberEmail: (e: string) => {
    try {
      storage()?.setItem(EMAIL_KEY, e);
    } catch {
      /* ignore */
    }
  },
};

export class ApiError extends Error {
  status: number;
  code: string;
  data: Record<string, unknown> | null;
  constructor(status: number, code: string, message: string, data: Record<string, unknown> | null) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

let signedOutHandler: () => void = () => {};
export const onSignedOut = (fn: () => void) => {
  signedOutHandler = fn;
};

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = session.get();
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (token) headers["x-session"] = token;
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "offline", "Can't reach the server. Check your connection.", null);
  }
  const refresh = res.headers.get("x-session-refresh");
  if (refresh) session.set(refresh);
  let data: Record<string, unknown> | null = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const code = (data?.error as string) ?? "error";
    if (res.status === 401 && code === "signed_out") {
      session.set(null);
      signedOutHandler();
    }
    throw new ApiError(res.status, code, (data?.message as string) ?? "Something went wrong", data);
  }
  return data as T;
}
