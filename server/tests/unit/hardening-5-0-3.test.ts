import { test } from "node:test";
import assert from "node:assert/strict";
import { envForRole, HIDDEN_VALUE } from "../../src/lib/redact";
import { cpuPercentFromSamples, getCadvisorService } from "../../src/services/cadvisor";
import { summarizeDockerClient, type SummaryDockerClient } from "../../src/services/docker";
import type { HostConfig } from "../../src/config/hosts";

const ID = "8036d207e562a1b2c3d4e5f60718293a4b5c6d7e8f9012345678901234567890";

// ---------- CY-01: env values ----------

const ENV = [
  { key: "DATABASE_URL", value: "postgres://app:s3cret@db/app" },
  { key: "API_KEY", value: "abc123" },
  { key: "TZ", value: "Asia/Taipei" },
];

test("env: admins see values", () => {
  assert.deepEqual(envForRole(ENV, "ADMIN"), ENV);
});

test("env: every other role gets names only, with all values hidden", () => {
  for (const role of ["VIEWER", "", undefined, "admin", "OWNER"]) {
    const masked = envForRole(ENV, role);
    assert.deepEqual(masked.map((e) => e.key), ["DATABASE_URL", "API_KEY", "TZ"]);
    assert.ok(masked.every((e) => e.value === HIDDEN_VALUE), String(role));
    assert.ok(!JSON.stringify(masked).includes("s3cret"));
  }
});

test("env: missing list becomes an empty list and the input is not modified", () => {
  assert.deepEqual(envForRole(undefined, "VIEWER"), []);
  envForRole(ENV, "VIEWER");
  assert.equal(ENV[0].value, "postgres://app:s3cret@db/app");
});

// ---------- CY-04: CPU percent ----------

function sample(tsMs: number, totalNs: number, perCpu?: number[]) {
  return {
    timestamp: new Date(tsMs).toISOString(),
    cpu: { usage: { total: totalNs, ...(perCpu ? { per_cpu_usage: perCpu } : {}) } },
  };
}

test("cpu: half a core for one second is 50 %", () => {
  assert.equal(cpuPercentFromSamples(sample(0, 1e9), sample(1000, 1.5e9)), 50);
});

test("cpu: same result with or without per_cpu_usage (cgroup v1 vs v2)", () => {
  const v2 = cpuPercentFromSamples(sample(0, 0), sample(2000, 3e9));
  const v1 = cpuPercentFromSamples(sample(0, 0, [0, 0, 0, 0]), sample(2000, 3e9, [1, 1, 1, 0]));
  assert.equal(v2, 150);
  assert.equal(v1, 150);
});

test("cpu: missing, reversed or idle samples are 0, never negative or NaN", () => {
  assert.equal(cpuPercentFromSamples(undefined, sample(1000, 1e9)), 0);
  assert.equal(cpuPercentFromSamples(sample(0, 1e9), undefined), 0);
  assert.equal(cpuPercentFromSamples(sample(1000, 1e9), sample(1000, 2e9)), 0); // no time passed
  assert.equal(cpuPercentFromSamples(sample(0, 2e9), sample(1000, 1e9)), 0);    // counter reset
  assert.equal(cpuPercentFromSamples(sample(0, 1e9), sample(1000, 1e9)), 0);    // idle
  assert.equal(cpuPercentFromSamples({ timestamp: "x" }, { timestamp: "y" }), 0);
});

// ---------- CY-06: cAdvisor ids ----------

const cadHost = {
  id: "nas",
  name: "nas",
  provider: "CADVISOR_ONLY",
  nodeLabel: "nas",
  cadvisorUrl: "http://cadvisor.invalid:8080",
} as unknown as HostConfig;

test("cadvisor: ids that are not container cgroup paths are refused before any request", async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    throw new Error("fetch must not be called");
  }) as typeof fetch;
  try {
    const service = getCadvisorService(cadHost)!;
    for (const bad of ["/../../metrics", "/docker/../../api/v2.0/machine", "/", "", "abc", `/docker/${ID}/../x`]) {
      await assert.rejects(service.getStats(cadHost, bad), (e: any) => e.status === 404, bad);
      await assert.rejects(service.getContainer(cadHost, bad), (e: any) => e.status === 404, bad);
    }
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("cadvisor: a real container path is requested and its CPU is computed", async () => {
  const realFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (url: any) => {
    urls.push(String(url));
    return new Response(
      JSON.stringify({
        name: `/docker/${ID}`,
        // cgroup v2 shape: no per_cpu_usage, cpu.limit is shares
        spec: { cpu: { limit: 1024 }, memory: { limit: 1000 } },
        stats: [sample(0, 0), sample(1000, 2e9)],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  try {
    const stats = await getCadvisorService(cadHost)!.getStats(cadHost, `/docker/${ID}`);
    assert.equal(urls.length, 1);
    assert.ok(urls[0].endsWith(`/api/v1.3/containers/docker/${ID}`), urls[0]);
    assert.equal(stats.cpuPercent, 200); // was ~0.2 when divided by 1024 "cores"
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ---------- CY-03: host summary ----------

function dockerStats(cpuDelta: number, mem: number) {
  return {
    cpu_stats: { cpu_usage: { total_usage: 1000 + cpuDelta }, system_cpu_usage: 20000, online_cpus: 4 },
    precpu_stats: { cpu_usage: { total_usage: 1000 }, system_cpu_usage: 10000 },
    memory_stats: { usage: mem, limit: 1 << 30 },
  };
}

test("summary: a container that disappears between list and stats is skipped", async () => {
  const client: SummaryDockerClient = {
    listContainers: async () => [
      { Id: "a", Names: ["/alpha"], State: "running" },
      { Id: "gone", Names: ["/exited-meanwhile"], State: "running" },
      { Id: "b", Names: ["/beta"], State: "running" },
    ],
    getContainer: (id) => ({
      stats: async () => {
        if (id === "gone") {
          const err: any = new Error("No such container: gone");
          err.statusCode = 404;
          throw err;
        }
        return id === "a" ? dockerStats(1000, 100) : dockerStats(500, 300);
      },
    }),
  };

  const summary = await summarizeDockerClient(client);

  assert.equal(summary.containers, 2);
  assert.equal(summary.memUsed, 400);
  assert.deepEqual(summary.topCpu.map((c) => c.name), ["alpha", "beta"]);
  assert.deepEqual(summary.topMem.map((c) => c.name), ["beta", "alpha"]);
  assert.equal(summary.topCpu[0].cpuPct, 40); // 1000/10000 * 4 cores * 100
});

test("summary: malformed stats count as zero instead of throwing", async () => {
  const client: SummaryDockerClient = {
    listContainers: async () => [{ Id: "a", Names: ["/alpha"], State: "running" }],
    getContainer: () => ({ stats: async () => ({}) }),
  };
  const summary = await summarizeDockerClient(client);
  assert.equal(summary.containers, 1);
  assert.equal(summary.totalCpu, 0);
});

test("summary: no running containers", async () => {
  const summary = await summarizeDockerClient({
    listContainers: async () => [],
    getContainer: () => ({ stats: async () => ({}) }),
  });
  assert.deepEqual(summary, { totalCpu: 0, memUsed: 0, topCpu: [], topMem: [], containers: 0 });
});
