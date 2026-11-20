import { test } from "node:test";
import assert from "node:assert/strict";
import { parseContainerInstant } from "../../src/lib/parseDockerStats";

test("cgroup v1: memory is usage minus page cache; blkio sums Read/Write ops", () => {
  const p = parseContainerInstant({
    read: "2026-11-20T10:00:00Z",
    cpu_stats: { cpu_usage: { total_usage: 400, percpu_usage: [1, 1, 1, 1] }, system_cpu_usage: 2000 },
    precpu_stats: { cpu_usage: { total_usage: 200 }, system_cpu_usage: 1000 },
    memory_stats: { usage: 1000, limit: 4000, stats: { cache: 400, rss: 500 } },
    blkio_stats: {
      io_service_bytes_recursive: [
        { op: "Read", value: 10 },
        { op: "Write", value: 20 },
        { op: "read", value: 5 },
        { op: "Sync", value: 99 },
        { op: "Total", value: 999 },
      ],
    },
  });
  // cores from percpu_usage length (4): (200/1000)*4*100
  assert.equal(p.cpuPct, 80);
  assert.equal(p.memBytes, 600);
  assert.equal(p.memPct, 15);
  assert.equal(p.blkRead, 15);
  assert.equal(p.blkWrite, 20);
  assert.equal(p.ts, "2026-11-20T10:00:00Z");
});

test("older engines: `network` (singular) and capitalised `Op`", () => {
  const p = parseContainerInstant({
    network: { eth0: { rx_bytes: 7, tx_bytes: 3 } },
    blkio_stats: { io_service_bytes_recursive: [{ Op: "Read", value: 4 }, { Op: "Write", value: 6 }] },
  });
  assert.equal(p.netRx, 7);
  assert.equal(p.netTx, 3);
  assert.equal(p.blkRead, 4);
  assert.equal(p.blkWrite, 6);
});

test("rss is the fallback when usage is missing", () => {
  assert.equal(parseContainerInstant({ memory_stats: { stats: { total_rss: 321 } } }).memBytes, 321);
});

test("cache larger than usage is not subtracted (no negative memory)", () => {
  assert.equal(parseContainerInstant({ memory_stats: { usage: 100, stats: { cache: 500 } } }).memBytes, 100);
});

test("an empty precpu gives the since-start average (Docker fills precpu for stream=false)", () => {
  // Same formula as `docker stats`: with nothing to diff against, the deltas
  // are the lifetime totals. ContainerYard requests stream=false without
  // one-shot, so the daemon samples twice and precpu is normally present.
  assert.equal(parseContainerInstant({ cpu_stats: { cpu_usage: { total_usage: 5 }, system_cpu_usage: 10 } }).cpuPct, 50);
});

test("an idle container reports 0 % CPU", () => {
  assert.equal(
    parseContainerInstant({
      cpu_stats: { cpu_usage: { total_usage: 5 }, system_cpu_usage: 20, online_cpus: 2 },
      precpu_stats: { cpu_usage: { total_usage: 5 }, system_cpu_usage: 10 },
    }).cpuPct,
    0,
  );
});

test("an empty or missing payload never throws and has no NaN", () => {
  for (const raw of [undefined, null, {}]) {
    const p = parseContainerInstant(raw);
    for (const [k, v] of Object.entries(p)) {
      if (k === "ts") assert.equal(typeof v, "string");
      else assert.equal(v, 0, k);
    }
  }
});
