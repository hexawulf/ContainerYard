/**
 * Minimal fake PiDeck read-only agent on 127.0.0.1:0 for host-log unit tests.
 *
 * Mirrors PiDeck's `/api/agent/logs` and `/api/agent/logs/:id` endpoints,
 * including bearer auth, strict query-parameter validation (400 on unknown
 * params), logs-off 404, 429 rate-limit, slow responses, and 302 redirects.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeAgentSource {
  id: string;
  label: string;
  kind: "file" | "journal" | "docker";
  readable: boolean;
  hint?: string;
  size?: number;
  mtime?: string;
  /** Included on purpose to verify ContainerYard never forwards it to browsers. */
  file?: string;
  lines?: string[];
  truncated?: boolean;
  redacted?: number;
}

export interface FakeAgentRequest {
  method: string;
  url: string;
  path: string;
  query: URLSearchParams;
  auth: string | undefined;
}

export interface FakePideckAgent {
  url: string;
  token: string;
  requests: FakeAgentRequest[];
  sources: FakeAgentSource[];
  logsEnabled: boolean;
  rateLimited: boolean;
  delayMs: number;
  redirectTo: string | null;
  bodySecretMarker: string;
  close(): Promise<void>;
}

export async function startFakePideckAgent(
  initialSources: FakeAgentSource[],
  opts: { token?: string } = {},
): Promise<FakePideckAgent> {
  const state: Omit<FakePideckAgent, "url" | "close"> = {
    token: opts.token ?? "test-agent-bearer-token-0123456789",
    requests: [],
    sources: initialSources.map((s) => ({ ...s })),
    logsEnabled: true,
    rateLimited: false,
    delayMs: 0,
    redirectTo: null,
    bodySecretMarker: "INTERNAL-AGENT-BODY-DO-NOT-LEAK",
  };

  const server = http.createServer(async (req, res) => {
    const parsed = new URL(req.url ?? "/", "http://127.0.0.1");
    state.requests.push({
      method: req.method ?? "GET",
      url: req.url ?? "/",
      path: parsed.pathname,
      query: parsed.searchParams,
      auth: req.headers.authorization,
    });

    if (state.delayMs > 0) {
      await new Promise((r) => setTimeout(r, state.delayMs));
      if (res.destroyed) return;
    }

    if (state.redirectTo) {
      res.writeHead(302, { Location: state.redirectTo });
      res.end();
      return;
    }

    if (state.rateLimited) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: `Too many requests (${state.bodySecretMarker})` }));
      return;
    }

    if (req.headers.authorization !== `Bearer ${state.token}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: `Unauthorized (${state.bodySecretMarker})` }));
      return;
    }

    if (!state.logsEnabled) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: `Not found (${state.bodySecretMarker})` }));
      return;
    }

    if (req.method === "GET" && parsed.pathname === "/api/agent/logs") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          sources: state.sources.map((s) => ({
            id: s.id,
            label: s.label,
            kind: s.kind,
            readable: s.readable,
            ...(s.hint ? { hint: s.hint } : {}),
            ...(s.size !== undefined ? { size: s.size } : {}),
            ...(s.mtime ? { mtime: s.mtime } : {}),
            ...(s.file ? { file: s.file } : {}),
          })),
          docker: { enabled: true, reachable: true },
        }),
      );
      return;
    }

    const match = /^\/api\/agent\/logs\/([^/]+)$/.exec(parsed.pathname);
    if (req.method === "GET" && match) {
      // Mirror PiDeck's strict query param validation: only `lines` and `filter` allowed.
      for (const k of Array.from(parsed.searchParams.keys())) {
        if (k !== "lines" && k !== "filter") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ message: `unknown parameter: ${k}` }));
          return;
        }
      }
      const id = decodeURIComponent(match[1]);
      const src = state.sources.find((s) => s.id === id);
      if (!src) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: `No such log source (${state.bodySecretMarker})` }));
        return;
      }
      if (!src.readable) {
        res.writeHead(409, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: `Not readable (${state.bodySecretMarker})` }));
        return;
      }

      const rawLines = parsed.searchParams.get("lines");
      const n = rawLines ? Number(rawLines) : 200;
      if (!Number.isInteger(n) || n < 1 || n > 2000) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "lines must be an integer 1–2000" }));
        return;
      }
      const filter = parsed.searchParams.get("filter") ?? undefined;
      let lines = (src.lines ?? []).slice(-n);
      if (filter) {
        const lower = filter.toLowerCase();
        lines = lines.filter((l) => l.toLowerCase().includes(lower));
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: src.id,
          label: src.label,
          kind: src.kind,
          lines,
          truncated: Boolean(src.truncated),
          redacted: src.redacted ?? 0,
          redactedLines: [],
        }),
      );
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Not found" }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    get url() {
      return `http://127.0.0.1:${port}`;
    },
    get token() {
      return state.token;
    },
    set token(v: string) {
      state.token = v;
    },
    requests: state.requests,
    sources: state.sources,
    get logsEnabled() {
      return state.logsEnabled;
    },
    set logsEnabled(v: boolean) {
      state.logsEnabled = v;
    },
    get rateLimited() {
      return state.rateLimited;
    },
    set rateLimited(v: boolean) {
      state.rateLimited = v;
    },
    get delayMs() {
      return state.delayMs;
    },
    set delayMs(v: number) {
      state.delayMs = v;
    },
    get redirectTo() {
      return state.redirectTo;
    },
    set redirectTo(v: string | null) {
      state.redirectTo = v;
    },
    bodySecretMarker: state.bodySecretMarker,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
