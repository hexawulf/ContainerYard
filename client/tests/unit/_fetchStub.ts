/** Replace global fetch for one test; records every call. */
import type { TestContext } from "node:test";

export interface FetchCall {
  url: string;
  init: RequestInit;
}

export type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

export function stubFetch(t: TestContext, handler: Handler): FetchCall[] {
  const calls: FetchCall[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = real;
  });
  return calls;
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export function text(status: number, body: string, type = "text/plain"): Response {
  return new Response(body, { status, headers: { "Content-Type": type } });
}

export function header(init: RequestInit, name: string): string | undefined {
  return (init.headers as Record<string, string> | undefined)?.[name];
}
