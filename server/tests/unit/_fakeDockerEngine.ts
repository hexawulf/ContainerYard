/**
 * A tiny fake Docker Engine API on a temporary Unix socket.
 *
 * The real dockerode/docker-modem client talks to it over HTTP, so tests
 * exercise ContainerYard's mapping code AND the exact error objects
 * docker-modem builds (statusCode, reason, json.message) — no mocks of
 * dockerode itself. Only the endpoints ContainerYard calls are implemented.
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type FakeState = "running" | "exited" | "paused";

export interface FakeContainer {
  id: string;
  name: string;
  image: string;
  state: FakeState;
  created?: number; // unix seconds
  labels?: Record<string, string>;
  /** List-view ports (GET /containers/json). */
  ports?: Array<{ IP?: string; PrivatePort: number; PublicPort?: number; Type: string }>;
  /** Inspect-view port map; null = exposed but not published. */
  portMap?: Record<string, Array<{ HostIp?: string; HostPort?: string }> | null>;
  env?: string[];
  cmd?: string[];
  mounts?: Array<{ Source: string; Destination: string; Mode: string; RW: boolean }>;
  networks?: Record<string, { IPAddress?: string; Gateway?: string; MacAddress?: string }>;
  stats?: unknown;
  /** Log frames: [1 = stdout | 2 = stderr, text]. */
  logs?: Array<[1 | 2, string]>;
}

export interface RecordedRequest {
  method: string;
  path: string;
  query: URLSearchParams;
}

export interface FakeEngine {
  socketPath: string;
  dir: string;
  requests: RecordedRequest[];
  containers: Map<string, FakeContainer>;
  /** Open follow-mode log responses, so a test can push frames or see them close. */
  followers: Set<http.ServerResponse>;
  close(): Promise<void>;
}

/** Docker's multiplexed log frame: 8-byte header + payload. */
export function logFrame(stream: 1 | 2, text: string): Buffer {
  const payload = Buffer.from(text, "utf8");
  const header = Buffer.alloc(8);
  header[0] = stream;
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

function send(res: http.ServerResponse, status: number, body?: unknown) {
  if (body === undefined) {
    res.writeHead(status);
    res.end();
    return;
  }
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function listView(c: FakeContainer) {
  return {
    Id: c.id,
    Names: [`/${c.name}`],
    Image: c.image,
    State: c.state,
    Status: c.state === "running" ? "Up 5 minutes" : c.state === "paused" ? "Up 5 minutes (Paused)" : "Exited (0) 1 minute ago",
    Created: c.created ?? 1_700_000_000,
    Labels: c.labels ?? {},
    Ports: c.ports ?? [],
    NetworkSettings: { Networks: c.networks ?? {} },
  };
}

function inspectView(c: FakeContainer) {
  return {
    Id: c.id,
    Name: `/${c.name}`,
    Created: new Date((c.created ?? 1_700_000_000) * 1000).toISOString(),
    State: { Status: c.state, StartedAt: "2026-11-20T00:00:00Z" },
    Config: { Image: c.image, Labels: c.labels ?? {}, Env: c.env ?? [], Cmd: c.cmd ?? null },
    Mounts: c.mounts ?? [],
    NetworkSettings: { Ports: c.portMap ?? {}, Networks: c.networks ?? {} },
  };
}

export async function startFakeDockerEngine(initial: FakeContainer[]): Promise<FakeEngine> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cy-fake-docker-"));
  const socketPath = path.join(dir, "docker.sock");
  const containers = new Map(initial.map((c) => [c.id, { ...c }]));
  const requests: RecordedRequest[] = [];
  const followers = new Set<http.ServerResponse>();

  const find = (ref: string) =>
    containers.get(ref) ?? Array.from(containers.values()).find((c) => c.name === ref || c.id.startsWith(ref));

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://docker");
    // dockerode may prefix an API version (/v1.47/...).
    const p = url.pathname.replace(/^\/v\d+\.\d+/, "");
    const method = req.method ?? "GET";
    requests.push({ method, path: p, query: url.searchParams });

    if (method === "GET" && p === "/containers/json") {
      const all = url.searchParams.get("all") === "true" || url.searchParams.get("all") === "1";
      const list = Array.from(containers.values()).filter((c) => all || c.state === "running");
      return send(res, 200, list.map(listView));
    }

    const m = /^\/containers\/([^/]+)(?:\/([a-z]+))?$/.exec(p);
    if (!m) return send(res, 404, { message: `page not found: ${p}` });
    const ref = decodeURIComponent(m[1]);
    const op = m[2];
    const c = find(ref);
    if (!c) return send(res, 404, { message: `No such container: ${ref}` });

    if (method === "DELETE" && !op) {
      containers.delete(c.id);
      return send(res, 204);
    }
    if (method === "GET" && op === "json") return send(res, 200, inspectView(c));
    if (method === "GET" && op === "stats") return send(res, 200, c.stats ?? {});
    if (method === "GET" && op === "logs") {
      const frames = (c.logs ?? []).map(([s, t]) => logFrame(s, t));
      if (url.searchParams.get("follow") === "true" || url.searchParams.get("follow") === "1") {
        res.writeHead(200, { "Content-Type": "application/vnd.docker.multiplexed-stream" });
        for (const f of frames) res.write(f);
        followers.add(res);
        res.on("close", () => followers.delete(res));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/vnd.docker.multiplexed-stream" });
      return res.end(Buffer.concat(frames));
    }
    if (method === "POST") {
      switch (op) {
        case "start":
          if (c.state === "running") return send(res, 304);
          c.state = "running";
          return send(res, 204);
        case "stop":
          if (c.state !== "running") return send(res, 304);
          c.state = "exited";
          return send(res, 204);
        case "restart":
          c.state = "running";
          return send(res, 204);
        case "pause":
          if (c.state !== "running") return send(res, 409, { message: `Container ${c.id} is not running` });
          c.state = "paused";
          return send(res, 204);
        case "unpause":
          if (c.state !== "paused") return send(res, 409, { message: `Container ${c.id} is not paused` });
          c.state = "running";
          return send(res, 204);
      }
    }
    return send(res, 404, { message: `unsupported: ${method} ${p}` });
  });

  await new Promise<void>((resolve) => server.listen(socketPath, resolve));

  return {
    socketPath,
    dir,
    requests,
    containers,
    followers,
    async close() {
      for (const f of Array.from(followers)) f.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
