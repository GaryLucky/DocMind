export type FastAPIValidationError = {
  loc: Array<string | number>;
  msg: string;
  type: string;
};

export class HttpError extends Error {
  status: number;
  url: string;
  detail: unknown;

  constructor(args: { status: number; url: string; message: string; detail: unknown }) {
    super(args.message);
    this.name = "HttpError";
    this.status = args.status;
    this.url = args.url;
    this.detail = args.detail;
  }
}

export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  return (err as { name?: unknown }).name === "AbortError";
}

function isFastAPIValidationErrors(value: unknown): value is FastAPIValidationError[] {
  if (!Array.isArray(value)) return false;
  return value.every((it) => {
    if (!it || typeof it !== "object") return false;
    const obj = it as Partial<FastAPIValidationError>;
    return Array.isArray(obj.loc) && typeof obj.msg === "string" && typeof obj.type === "string";
  });
}

function formatValidationErrors(items: FastAPIValidationError[]): string {
  const formatLoc = (loc: Array<string | number>) => {
    const filtered = loc.filter((x) => x !== "body" && x !== "query" && x !== "path" && x !== "header");
    return filtered.length ? filtered.join(".") : loc.join(".");
  };
  return items.map((it) => `${formatLoc(it.loc)}: ${it.msg}`).join("；");
}

function formatFastAPIDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (isFastAPIValidationErrors(detail)) return formatValidationErrors(detail);
  if (detail == null) return "";
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

async function readBodyAsAny(resp: Response): Promise<unknown> {
  const ct = resp.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return await resp.json();
  }
  return await resp.text();
}

function readAccessToken(): string | null {
  try {
    return localStorage.getItem("access_token");
  } catch {
    return null;
  }
}

function clearAccessToken() {
  try {
    localStorage.removeItem("access_token");
  } catch {
    return;
  }
  try {
    window.dispatchEvent(new Event("auth:logout"));
  } catch {
    return;
  }
}

export async function httpJson<T>(
  url: string,
  init?: RequestInit & { signal?: AbortSignal }
): Promise<T> {
  const token = readAccessToken();
  const authHeader = token ? `Bearer ${token}` : null;

  const resp = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(authHeader ? { Authorization: authHeader } : {}),
      ...(init?.headers || {}),
    },
  });

  if (!resp.ok) {
    if (resp.status === 401) {
      clearAccessToken();
    }
    const data = await readBodyAsAny(resp);
    const detail =
      data && typeof data === "object" && "detail" in data ? (data as { detail: unknown }).detail : data;
    const msg = formatFastAPIDetail(detail) || `HTTP ${resp.status}`;
    throw new HttpError({ status: resp.status, url, message: msg, detail: data });
  }

  return (await resp.json()) as T;
}

export async function httpForm<T>(
  url: string,
  args: { form: FormData; signal?: AbortSignal }
): Promise<T> {
  const token = readAccessToken();
  const authHeader = token ? `Bearer ${token}` : null;

  const resp = await fetch(url, {
    method: "POST",
    body: args.form,
    signal: args.signal,
    headers: {
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
  });

  if (!resp.ok) {
    if (resp.status === 401) {
      clearAccessToken();
    }
    const data = await readBodyAsAny(resp);
    const detail =
      data && typeof data === "object" && "detail" in data ? (data as { detail: unknown }).detail : data;
    const msg = formatFastAPIDetail(detail) || `HTTP ${resp.status}`;
    throw new HttpError({ status: resp.status, url, message: msg, detail: data });
  }

  return (await resp.json()) as T;
}

function parseFilenameFromContentDisposition(value: string | null): string | null {
  if (!value) return null;
  const m = /filename="([^"]+)"/i.exec(value);
  if (m && m[1]) return m[1];
  const m2 = /filename=([^;]+)/i.exec(value);
  if (m2 && m2[1]) return m2[1].trim();
  return null;
}

export type BlobResult = {
  blob: Blob;
  filename: string | null;
  contentType: string | null;
};

export async function httpBlob(
  url: string,
  init?: RequestInit & { signal?: AbortSignal }
): Promise<BlobResult> {
  const token = readAccessToken();
  const authHeader = token ? `Bearer ${token}` : null;

  const resp = await fetch(url, {
    ...init,
    headers: {
      ...(authHeader ? { Authorization: authHeader } : {}),
      ...(init?.headers || {}),
    },
  });

  if (!resp.ok) {
    if (resp.status === 401) {
      clearAccessToken();
    }
    const data = await readBodyAsAny(resp);
    const detail =
      data && typeof data === "object" && "detail" in data ? (data as { detail: unknown }).detail : data;
    const msg = formatFastAPIDetail(detail) || `HTTP ${resp.status}`;
    throw new HttpError({ status: resp.status, url, message: msg, detail: data });
  }

  const cd = resp.headers.get("content-disposition");
  return {
    blob: await resp.blob(),
    filename: parseFilenameFromContentDisposition(cd),
    contentType: resp.headers.get("content-type"),
  };
}

export type SseEvent = {
  event: string;
  data: unknown;
  raw: string;
};

function tryJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export async function httpSse(
  url: string,
  args: {
    init: RequestInit;
    signal?: AbortSignal;
    onEvent: (evt: SseEvent) => void;
  }
): Promise<void> {
  const token = readAccessToken();
  const authHeader = token ? `Bearer ${token}` : null;

  const resp = await fetch(url, {
    ...args.init,
    signal: args.signal,
    headers: {
      ...(authHeader ? { Authorization: authHeader } : {}),
      ...(args.init.headers || {}),
    },
  });

  if (!resp.ok) {
    if (resp.status === 401) {
      clearAccessToken();
    }
    const data = await readBodyAsAny(resp);
    const detail =
      data && typeof data === "object" && "detail" in data ? (data as { detail: unknown }).detail : data;
    const msg = formatFastAPIDetail(detail) || `HTTP ${resp.status}`;
    throw new HttpError({ status: resp.status, url, message: msg, detail: data });
  }

  if (!resp.body) {
    throw new Error("响应不支持流式读取");
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    buf = buf.replace(/\r\n/g, "\n");

    while (true) {
      const idx = buf.indexOf("\n\n");
      if (idx === -1) break;
      const rawEvent = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const lines = rawEvent.split("\n").map((l) => l.trimEnd());
      let event = "message";
      const dataLines: string[] = [];
      for (const line of lines) {
        if (!line) continue;
        if (line.startsWith("event:")) {
          event = line.slice("event:".length).trim() || "message";
          continue;
        }
        if (line.startsWith("data:")) {
          dataLines.push(line.slice("data:".length).trimStart());
          continue;
        }
      }
      const raw = dataLines.join("\n");
      args.onEvent({ event, raw, data: tryJsonParse(raw) });
    }
  }
}
