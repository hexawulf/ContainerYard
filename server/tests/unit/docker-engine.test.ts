import "./_testEnv";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  commandString,
  getContainerDetail,
  getContainerLogs,
  getContainerStats,
  getDockerClientForHost,
  listContainers,
  parseSince,
  performAction,
  performBulkAction,
  streamContainerLogs,
} from "../../src/services/docker";
import { HttpError, errorInfo } from "../../src/lib/httpError";
import type { HostConfig } from "../../src/config/hosts";
import { logFrame, startFakeDockerEngine, type FakeEngine } from "./_fakeDockerEngine";

const WEB = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678901234567890abcdefabcdef";
const DB = "b1b2c3d4e5f60718293a4b5c6d7e8f9012345678901234567890abcdefabcdef";
const OLD = "c1b2c3d4e5f60718293a4b5c6d7e8f9012345678901234567890abcdefabcdef";

let engine: FakeEngine;
let host: HostConfig;

function dockerHost(socketPath: string, id = "fake"): HostConfig {
  return { id, name: "Fake Docker", provider: "DOCKER", nodeLabel: `${id}-node`, docker: { socketPath } };
}

/** Assert a rejection carries this HTTP status (and optionally code). */
function httpStatus(status: number, code?: string) {
  return (err: unknown) => {
    const info = errorInfo(err);
    return info.status === status && (code === undefined || info.code === code);
  };
}

before(async () => {
  engine = await startFakeDockerEngine([
    {
      id: WEB,
      name: "shop-web-1",
      image: "nginx:1.27",
      state: "running",
      created: 1_763_600_000,
      labels: { "com.docker.compose.project": "shop", "com.docker.compose.service": "web" },
      ports: [
        { IP: "0.0.0.0", PrivatePort: 80, PublicPort: 8080, Type: "tcp" },
        { PrivatePort: 443, Type: "tcp" },
      ],
      portMap: { "80/tcp": [{ HostIp: "0.0.0.0", HostPort: "8080" }], "443/tcp": null },
      env: ["TZ=Asia/Taipei", "DSN=postgres://u:p@db/x?a=b=c", "EMPTY=", "=nokey"],
      cmd: ["nginx", "-g", "daemon off;"],
      mounts: [{ Source: "/srv/www", Destination: "/usr/share/nginx/html", Mode: "ro", RW: false }],
      networks: { shop_default: { IPAddress: "172.18.0.2", Gateway: "172.18.0.1", MacAddress: "" } },
      stats: {
        read: "2026-11-20T10:00:00Z",
        cpu_stats: { cpu_usage: { total_usage: 3_000_000 }, system_cpu_usage: 20_000_000, online_cpus: 2 },
        precpu_stats: { cpu_usage: { total_usage: 1_000_000 }, system_cpu_usage: 10_000_000 },
        memory_stats: { usage: 300, limit: 1000, stats: { inactive_file: 100 } },
        networks: { eth0: { rx_bytes: 10, tx_bytes: 20 }, eth1: { rx_bytes: 1, tx_bytes: 2 } },
        blkio_stats: { io_service_bytes_recursive: null },
      },
      logs: [
        [1, "2026-11-20T10:00:00Z GET / 200\n"],
        [2, "2026-11-20T10:00:01Z error: upstream timed out\n"],
        [1, "2026-11-20T10:00:02Z GET /health 200\n"],
      ],
    },
    { id: DB, name: "shop-db-1", image: "postgres:17", state: "running", labels: { "com.docker.compose.project": "shop" } },
    { id: OLD, name: "old-job", image: "busybox", state: "exited" },
  ]);
  host = dockerHost(engine.socketPath);
});

after(async () => {
  await engine.close();
});

describe("listContainers", () => {
  test("maps every container, including stopped ones", async () => {
    const list = await listContainers(host);
    assert.deepEqual(list.map((c) => c.name).sort(), ["old-job", "shop-db-1", "shop-web-1"]);
    const web = list.find((c) => c.id === WEB)!;
    assert.equal(web.hostId, "fake");
    assert.equal(web.provider, "DOCKER");
    assert.equal(web.node, "fake-node");
    assert.equal(web.image, "nginx:1.27");
    assert.equal(web.state, "running");
    assert.equal(web.status, "Up 5 minutes");
    assert.equal(web.composeProject, "shop");
    assert.equal(web.createdAt, new Date(1_763_600_000 * 1000).toISOString());
    assert.deepEqual(web.ports, [
      { ip: "0.0.0.0", privatePort: 80, publicPort: 8080, protocol: "tcp" },
      { ip: null, privatePort: 443, publicPort: null, protocol: "tcp" },
    ]);
    assert.deepEqual(web.networks, [
      { name: "shop_default", ipAddress: "172.18.0.2", gateway: "172.18.0.1", macAddress: null },
    ]);
    assert.equal(list.find((c) => c.id === OLD)!.composeProject, null);
  });

  test("a missing socket is a 503 DOCKER_UNAVAILABLE, not a crash", async () => {
    const missing = dockerHost(path.join(os.tmpdir(), "cy-no-such-dir", "docker.sock"), "missing");
    await assert.rejects(listContainers(missing), httpStatus(503, "DOCKER_UNAVAILABLE"));
  });

  test(
    "a socket without permission is a 503 DOCKER_PERMISSION_DENIED",
    { skip: process.getuid?.() === 0 ? "root ignores socket permissions" : false },
    async () => {
      const locked = await startFakeDockerEngine([]);
      try {
        fs.chmodSync(locked.socketPath, 0o000);
        await assert.rejects(
          listContainers(dockerHost(locked.socketPath, "locked")),
          httpStatus(503, "DOCKER_PERMISSION_DENIED"),
        );
      } finally {
        fs.chmodSync(locked.socketPath, 0o600);
        await locked.close();
      }
    },
  );

  test("a host without a Docker socket is a 400", () => {
    const cad: HostConfig = { id: "cad", name: "cAdvisor", provider: "CADVISOR_ONLY", nodeLabel: "cad" };
    assert.throws(() => getDockerClientForHost(cad), (e: unknown) => e instanceof HttpError && e.status === 400);
  });
});

describe("getContainerDetail", () => {
  test("maps ports (published and unpublished), env, mounts, command and start time", async () => {
    const d = await getContainerDetail(host, WEB);
    assert.equal(d.name, "shop-web-1");
    assert.equal(d.state, "running");
    assert.equal(d.composeProject, "shop");
    assert.deepEqual(d.ports, [
      { ip: "0.0.0.0", privatePort: 80, publicPort: 8080, protocol: "tcp" },
      { ip: null, privatePort: 443, publicPort: null, protocol: "tcp" },
    ]);
    // "=" inside a value is kept; an entry with no key is dropped.
    assert.deepEqual(d.env, [
      { key: "TZ", value: "Asia/Taipei" },
      { key: "DSN", value: "postgres://u:p@db/x?a=b=c" },
      { key: "EMPTY", value: "" },
    ]);
    assert.deepEqual(d.mounts, [{ source: "/srv/www", destination: "/usr/share/nginx/html", mode: "ro", rw: false }]);
    assert.equal(d.command, "nginx -g daemon off;");
    assert.equal(d.startedAt, "2026-11-20T00:00:00Z");
  });

  test("works by container name too", async () => {
    assert.equal((await getContainerDetail(host, "shop-db-1")).id, DB);
  });

  test("an unknown container is a 404 that names the host", async () => {
    await assert.rejects(getContainerDetail(host, "nope"), (e: unknown) => {
      const info = errorInfo(e);
      return info.status === 404 && info.message.includes("host fake");
    });
  });

  test("a path-like id is refused before it reaches the socket", async () => {
    const before = engine.requests.length;
    await assert.rejects(getContainerDetail(host, "../../images/json"), httpStatus(400));
    assert.equal(engine.requests.length, before);
  });
});

describe("getContainerStats", () => {
  test("parses CPU, working-set memory, network and a null blkio (cgroup v2)", async () => {
    const s = await getContainerStats(host, WEB);
    // cpu: (2e6 / 1e7) * 2 cores * 100 = 40 %
    assert.equal(s.cpuPercent, 40);
    assert.equal(s.memoryUsage, 200); // 300 usage - 100 inactive_file
    assert.equal(s.memoryLimit, 1000);
    assert.equal(s.memoryPercent, 20);
    assert.equal(s.networkRx, 11);
    assert.equal(s.networkTx, 22);
    assert.equal(s.blockRead, 0);
    assert.equal(s.blockWrite, 0);
    assert.equal(s.timestamp, "2026-11-20T10:00:00Z");
  });

  test("an unknown container is a 404", async () => {
    await assert.rejects(getContainerStats(host, "ghost"), httpStatus(404));
  });
});

describe("getContainerLogs", () => {
  test("demuxes stdout + stderr and sends tail, since and timestamps to Docker", async () => {
    const t0 = Date.now();
    const logs = await getContainerLogs(host, WEB, { tail: 50, since: "15m" });
    assert.match(logs, /GET \/ 200/);
    assert.match(logs, /error: upstream timed out/);
    const req = engine.requests.filter((r) => r.path.endsWith("/logs")).at(-1)!;
    assert.equal(req.query.get("tail"), "50");
    assert.equal(req.query.get("timestamps"), "true");
    const since = Number(req.query.get("since"));
    const expected = Math.floor(t0 / 1000) - 900;
    assert.ok(Math.abs(since - expected) <= 2, `since ${since} ≈ ${expected}`);
  });

  test("tail is capped at 5000", async () => {
    await getContainerLogs(host, WEB, { tail: 1_000_000 });
    const req = engine.requests.filter((r) => r.path.endsWith("/logs")).at(-1)!;
    assert.equal(req.query.get("tail"), "5000");
  });

  test("grep is a case-insensitive literal match, not a regex", async () => {
    assert.deepEqual((await getContainerLogs(host, WEB, { grep: "ERROR" })).split("\n"), [
      "2026-11-20T10:00:01Z error: upstream timed out",
    ]);
    assert.equal(await getContainerLogs(host, WEB, { grep: "GET /.*" }), "");
  });

  test("an unknown container is a 404", async () => {
    await assert.rejects(getContainerLogs(host, "ghost"), httpStatus(404));
  });
});

describe("streamContainerLogs", () => {
  test("emits complete lines across split frames, filters with grep, and stops cleanly", async () => {
    const lines: string[] = [];
    const errors: Error[] = [];
    const stop = await streamContainerLogs(host, WEB, { grep: "get" }, (l) => lines.push(l), (e) => errors.push(e));

    // Wait for the follow connection, then push one frame split in two writes.
    for (let i = 0; i < 50 && engine.followers.size === 0; i++) await new Promise((r) => setTimeout(r, 10));
    const [res] = Array.from(engine.followers);
    assert.ok(res, "follow request reached the engine");
    const frame = logFrame(1, "2026-11-20T10:00:03Z GET /late 200\n");
    res.write(frame.subarray(0, 5));
    res.write(frame.subarray(5));

    for (let i = 0; i < 50 && lines.length < 3; i++) await new Promise((r) => setTimeout(r, 10));
    stop();
    for (let i = 0; i < 50 && engine.followers.size > 0; i++) await new Promise((r) => setTimeout(r, 10));

    assert.deepEqual(lines, [
      "2026-11-20T10:00:00Z GET / 200",
      "2026-11-20T10:00:02Z GET /health 200",
      "2026-11-20T10:00:03Z GET /late 200",
    ]);
    assert.deepEqual(errors, []);
    assert.equal(engine.followers.size, 0, "stop() closes the Docker connection");
  });
});

describe("performAction", () => {
  test("stop then start report the new state", async () => {
    const stopped = await performAction(host, "shop-db-1", "stop");
    assert.deepEqual(stopped, { id: DB, name: "shop-db-1", state: "exited", noop: false });
    const started = await performAction(host, DB, "start");
    assert.equal(started.state, "running");
    assert.equal(started.noop, false);
  });

  test("Docker's 304 (already running / already stopped) is a no-op success", async () => {
    const r = await performAction(host, WEB, "start");
    assert.equal(r.noop, true);
    assert.equal(r.state, "running");
    const s = await performAction(host, OLD, "stop");
    assert.equal(s.noop, true);
  });

  test("pause/unpause conflicts become a 409 with Docker's message", async () => {
    await assert.rejects(performAction(host, OLD, "pause"), (e: unknown) => {
      const info = errorInfo(e);
      return info.status === 409 && info.message === `Cannot pause old-job: Container ${OLD} is not running`;
    });
    await assert.rejects(performAction(host, WEB, "unpause"), httpStatus(409));
    assert.equal((await performAction(host, WEB, "pause")).state, "paused");
    assert.equal((await performAction(host, WEB, "unpause")).state, "running");
  });

  test("restart and remove", async () => {
    assert.equal((await performAction(host, DB, "restart")).state, "running");
    const removed = await performAction(host, OLD, "remove");
    assert.deepEqual(removed, { id: OLD, name: "old-job", noop: false });
    assert.equal(engine.containers.has(OLD), false);
    const del = engine.requests.find((r) => r.method === "DELETE")!;
    assert.equal(del.query.get("force"), "true");
  });

  test("an unknown container is a 404 and nothing is sent after the inspect", async () => {
    const before = engine.requests.length;
    await assert.rejects(performAction(host, "ghost", "stop"), httpStatus(404));
    assert.deepEqual(engine.requests.slice(before).map((r) => r.method), ["GET"]);
  });

  test("bulk actions report how many failed and log each failure", async (t) => {
    const logged = t.mock.method(console, "error", () => {});
    await assert.rejects(
      performBulkAction(host, [WEB, "ghost-1", "ghost-2"], "restart"),
      /Failed to restart 2 of 3 containers/,
    );
    assert.deepEqual(
      logged.mock.calls.map((c) => c.arguments[0]),
      ["Failed to restart container ghost-1:", "Failed to restart container ghost-2:"],
    );
    await performBulkAction(host, [WEB, DB], "restart");
  });
});

describe("parseSince", () => {
  const NOW = Date.parse("2026-11-20T12:00:00Z");
  const nowSec = NOW / 1000;

  test("seconds-ago as a number or digit string", () => {
    assert.equal(parseSince(3600, NOW), nowSec - 3600);
    assert.equal(parseSince("3600", NOW), nowSec - 3600);
    assert.equal(parseSince(90.9, NOW), nowSec - 90);
  });

  test("durations with a unit", () => {
    assert.equal(parseSince("90s", NOW), nowSec - 90);
    assert.equal(parseSince("15m", NOW), nowSec - 900);
    assert.equal(parseSince("2h", NOW), nowSec - 7200);
    assert.equal(parseSince("1D", NOW), nowSec - 86400);
    assert.equal(parseSince(" 3 h ", NOW), nowSec - 10800);
  });

  test("ISO timestamps", () => {
    assert.equal(parseSince("2026-11-20T11:00:00Z", NOW), nowSec - 3600);
  });

  test("empty, zero, negative and garbage are ignored", () => {
    for (const v of [undefined, "", 0, -5, "0", "abc", "5w", Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(parseSince(v as number | string | undefined, NOW), undefined, String(v));
    }
  });
});

describe("commandString", () => {
  test("joins an array, keeps a legacy string, and is null otherwise", () => {
    assert.equal(commandString(["sh", "-c", "echo hi"]), "sh -c echo hi");
    assert.equal(commandString([]), "");
    assert.equal(commandString("run.sh --flag"), "run.sh --flag");
    assert.equal(commandString(null), null);
    assert.equal(commandString(undefined), null);
    assert.equal(commandString(42), null);
  });
});
