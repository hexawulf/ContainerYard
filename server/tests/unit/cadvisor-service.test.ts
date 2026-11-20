/**
 * cAdvisor-only hosts (NAS, VPS) against a fake cAdvisor HTTP server:
 * container discovery, stats mapping, endpoint probing and error mapping.
 */
import { after, test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { cadvisorDisplayName, getCadvisorService, hostSummary } from "../../src/services/cadvisor";
import { errorInfo } from "../../src/lib/httpError";
import type { HostConfig } from "../../src/config/hosts";

const V1_ID = "1111111111111111111111111111111111111111111111111111111111111111";
const V2_ID = "2222222222222222222222222222222222222222222222222222222222222222";
const V1_PATH = `/docker/${V1_ID}`;
const V2_PATH = `/system.slice/docker-${V2_ID}.scope`;

function sample(tsMs: number, cpuNs: number, extra: Record<string, unknown> = {}) {
  return { timestamp: new Date(tsMs).toISOString(), cpu: { usage: { total: cpuNs } }, ...extra };
}

const CONTAINERS = [
  { name: "/docker" }, // parent cgroup: not a container
  { name: "/system.slice/pkg-ContainerManager-dockerd.service" }, // daemon unit
  { name: "/system.slice/ssh.service" },
  {
    // cgroup v1 (NAS): alias carries the container name, blkio as op/value
    name: V1_PATH,
    aliases: ["plex", V1_ID],
    spec: { image: "plexinc/pms-docker", creation_time: "2026-11-01T00:00:00Z", memory: { limit: 4000 } },
    stats: [
      sample(0, 0),
      sample(1000, 5e8, {
        memory: { usage: 3000, working_set: 1000 },
        network: { interfaces: [{ rx_bytes: 5, tx_bytes: 6 }, { rx_bytes: 1, tx_bytes: 1 }] },
        diskio: { io_service_bytes_recursive: [{ op: "Read", value: 7 }, { op: "Write", value: 8 }, { op: "Total", value: 15 }] },
      }),
    ],
  },
  {
    // cgroup v2 (VPS): compose label, per-device diskio, no working_set
    name: V2_PATH,
    spec: { image: "nginx:1.27", labels: { "com.docker.compose.project": "edge" }, memory: { limit: 0 } },
    stats: [
      sample(0, 0),
      sample(2000, 3e9, {
        memory: { usage: 2048 },
        diskio: { io_service_bytes: [{ stats: { Read: 10, Write: 20 } }, { stats: { read: 1, write: 2 } }] },
      }),
    ],
  },
];

interface FakeCadvisor {
  base: string;
  hits: string[];
  close(): Promise<void>;
}

/** `answer(path)` returns [status, body] for a request path. */
async function fakeCadvisor(answer: (method: string, path: string) => [number, unknown?]): Promise<FakeCadvisor> {
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    hits.push(`${req.method} ${path}`);
    const [status, body] = answer(req.method ?? "GET", path);
    if (body === undefined) return void res.writeHead(status).end();
    res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    hits,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

const open: FakeCadvisor[] = [];
after(async () => {
  await Promise.all(open.map((s) => s.close()));
});

async function started(answer: (method: string, path: string) => [number, unknown?]) {
  const s = await fakeCadvisor(answer);
  open.push(s);
  return s;
}

function cadHost(base: string, id = "nas"): HostConfig {
  return { id, name: id, provider: "CADVISOR_ONLY", nodeLabel: id, cadvisorUrl: base, cadvisor: { baseUrl: base } };
}

function quiet(t: TestContext) {
  t.mock.method(console, "log", () => {});
  t.mock.method(console, "warn", () => {});
  t.mock.method(console, "error", () => {});
}

/** Standard v1.3 server: subcontainers list + per-container lookups. */
function standard(method: string, path: string): [number, unknown?] {
  if (path === "/api/v1.3/subcontainers") return method === "HEAD" ? [200] : [200, CONTAINERS];
  const c = CONTAINERS.find((x) => `/api/v1.3/containers${x.name}` === path);
  return c ? [200, c] : [404, { error: "not found" }];
}

test("only real container cgroups are listed, with names, images and compose project", async (t) => {
  quiet(t);
  const s = await started(standard);
  const list = await getCadvisorService(cadHost(s.base))!.listContainers(cadHost(s.base));
  assert.deepEqual(
    list.map((c) => ({ id: c.id, name: c.name, image: c.image, project: c.composeProject, state: c.state, node: c.node })),
    [
      { id: V1_PATH, name: "plex", image: "plexinc/pms-docker", project: null, state: "running", node: "nas" },
      { id: V2_PATH, name: V2_ID, image: "nginx:1.27", project: "edge", state: "running", node: "nas" },
    ],
  );
  assert.equal(list[0].createdAt, "2026-11-01T00:00:00Z");
  assert.deepEqual(list[0].ports, []);
});

test("stats: CPU % of one core, working set, interfaces summed, blkio ops (cgroup v1)", async (t) => {
  quiet(t);
  const s = await started(standard);
  const host = cadHost(s.base, "nas-v1");
  const st = await getCadvisorService(host)!.getStats(host, V1_PATH);
  assert.deepEqual(
    {
      cpu: st.cpuPercent,
      mem: st.memoryUsage,
      limit: st.memoryLimit,
      memPct: st.memoryPercent,
      rx: st.networkRx,
      tx: st.networkTx,
      read: st.blockRead,
      write: st.blockWrite,
      provider: st.provider,
    },
    { cpu: 50, mem: 1000, limit: 4000, memPct: 25, rx: 6, tx: 7, read: 7, write: 8, provider: "CADVISOR_ONLY" },
  );
});

test("stats: per-device diskio (either case), usage fallback, no limit → 0 % (cgroup v2)", async (t) => {
  quiet(t);
  const s = await started(standard);
  const host = cadHost(s.base, "vps-v2");
  const st = await getCadvisorService(host)!.getStats(host, V2_PATH);
  assert.equal(st.cpuPercent, 150);
  assert.equal(st.memoryUsage, 2048);
  assert.equal(st.memoryPercent, 0);
  assert.equal(st.blockRead, 11);
  assert.equal(st.blockWrite, 22);
  assert.equal(st.networkRx, 0);
});

test("detail: summary plus empty env/mounts and the creation time as start", async (t) => {
  quiet(t);
  const s = await started(standard);
  const host = cadHost(s.base, "nas-detail");
  const d = await getCadvisorService(host)!.getContainer(host, V1_PATH);
  assert.equal(d.name, "plex");
  assert.deepEqual({ env: d.env, mounts: d.mounts, command: d.command }, { env: [], mounts: [], command: null });
  assert.equal(d.startedAt, "2026-11-01T00:00:00Z");
});

test("endpoint probing: falls through to the API version that answers, then remembers it", async (t) => {
  quiet(t);
  const s = await started((method, path) =>
    path === "/api/v2.0/subcontainers" ? (method === "HEAD" ? [200] : [200, CONTAINERS]) : [404],
  );
  const host = cadHost(s.base, "old-cadvisor");
  const svc = getCadvisorService(host)!;
  assert.equal((await svc.listContainers(host)).length, 2);
  assert.deepEqual(s.hits, [
    "HEAD /api/v1.3/subcontainers",
    "HEAD /api/v1.0/subcontainers",
    "HEAD /api/v2.0/subcontainers",
    "GET /api/v2.0/subcontainers",
  ]);
  await svc.listContainers(host);
  assert.deepEqual(s.hits.slice(4), ["GET /api/v2.0/subcontainers"], "no second probe");
});

test("errors: 404 everywhere → 502 CADVISOR_ENDPOINT_NOT_FOUND, without the internal URL", async (t) => {
  quiet(t);
  const s = await started(() => [404]);
  const host = cadHost(s.base, "lost");
  await assert.rejects(getCadvisorService(host)!.listContainers(host), (e: unknown) => {
    const info = errorInfo(e);
    return (
      info.status === 502 &&
      info.code === "CADVISOR_ENDPOINT_NOT_FOUND" &&
      (e as { hostId?: string }).hostId === "lost" &&
      !info.message.includes(s.base)
    );
  });
});

test("errors: a 500 → 502 CADVISOR_ERROR that keeps the upstream reason", async (t) => {
  quiet(t);
  const s = await started((method) => (method === "HEAD" ? [200] : [500]));
  const host = cadHost(s.base, "broken");
  await assert.rejects(getCadvisorService(host)!.listContainers(host), (e: unknown) => {
    const info = errorInfo(e);
    const original = (e as { originalError?: string }).originalError ?? "";
    return info.status === 502 && info.code === "CADVISOR_ERROR" && /500/.test(original);
  });
});

test("errors: an unreachable host → 502 CADVISOR_ERROR, not an unhandled rejection", async (t) => {
  quiet(t);
  const s = await fakeCadvisor(() => [200]);
  await s.close(); // nothing listens on this port any more
  const host = cadHost(s.base, "down");
  await assert.rejects(getCadvisorService(host)!.listContainers(host), (e: unknown) => errorInfo(e).code === "CADVISOR_ERROR");
});

test("getCadvisorService: missing or invalid URL → null; one instance per base URL", (t) => {
  quiet(t);
  assert.equal(getCadvisorService({ id: "x", name: "x", provider: "CADVISOR_ONLY", nodeLabel: "x" }), null);
  assert.equal(getCadvisorService(cadHost("not a url", "bad")), null);
  const a = getCadvisorService(cadHost("http://192.0.2.1:8080", "a"));
  const b = getCadvisorService(cadHost("http://192.0.2.1:8080", "b"));
  assert.ok(a && a === b);
});

test("hostSummary: container count, memory total and top lists", async (t) => {
  quiet(t);
  const s = await started(standard);
  const sum = await hostSummary(s.base);
  assert.equal(sum.containers, 2);
  assert.equal(sum.memUsed, 1000 + 2048);
  assert.equal(sum.totalCpu, (50 + 150) / 2);
  assert.deepEqual(sum.topCpu.map((c) => c.name), [V2_ID, "plex"]);
  assert.deepEqual(sum.topMem.map((c) => c.id), [V2_ID, V1_ID]);
});

test("display name: alias first, else the container id from the cgroup path (v1 and v2)", () => {
  assert.equal(cadvisorDisplayName(["plex", V1_ID], V1_PATH), "plex");
  assert.equal(cadvisorDisplayName(["/docker/plex"], V1_PATH), "plex");
  assert.equal(cadvisorDisplayName(undefined, V1_PATH), V1_ID);
  // Regression: this used to be "system.slice/docker-<id>.scope"
  assert.equal(cadvisorDisplayName([], V2_PATH), V2_ID);
  assert.equal(cadvisorDisplayName([""], V2_PATH), V2_ID);
  assert.equal(cadvisorDisplayName(undefined, undefined), "");
});
