import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TtlCache } from "../../src/lib/ttlCache";
import {
  newestPm2LogAsync,
  resolveHostLogsAsync,
  isReadableAsync,
} from "../../src/config/hostlogs";

describe("Speed & Performance Audit (PR 2)", () => {
  describe("TtlCache (CY-A11 / CY-A12)", () => {
    test("returns cached value within ttlMs and coalesces concurrent misses (singleflight)", async () => {
      let now = 1000;
      const cache = new TtlCache({ ttlMs: 2000, staleMs: 10000, now: () => now });
      let loads = 0;

      const loader = async () => {
        loads++;
        await new Promise((r) => setTimeout(r, 15));
        return { n: loads };
      };

      // 10 concurrent misses -> 1 loader call
      const results = await Promise.all(
        Array.from({ length: 10 }, () => cache.get("k1", loader)),
      );
      assert.equal(loads, 1);
      for (const r of results) assert.deepEqual(r, { n: 1 });

      // Within TTL -> no new load
      now = 2500;
      const cached = await cache.get("k1", loader);
      assert.equal(loads, 1);
      assert.deepEqual(cached, { n: 1 });

      // After invalidate -> fresh load
      cache.invalidate("k");
      const fresh = await cache.get("k1", loader);
      assert.equal(loads, 2);
      assert.deepEqual(fresh, { n: 2 });
    });

    test("does not cache errors and triggers background refresh in stale window", async () => {
      let now = 1000;
      const cache = new TtlCache({ ttlMs: 1000, staleMs: 5000, now: () => now });
      let failNext = true;
      let calls = 0;

      await assert.rejects(
        cache.get("err", async () => {
          calls++;
          if (failNext) throw new Error("boom");
          return "ok";
        }),
        /boom/,
      );
      failNext = false;
      const ok = await cache.get("err", async () => {
        calls++;
        return "ok";
      });
      assert.equal(ok, "ok");
      assert.equal(calls, 2);

      // Move into stale window (age 2000ms > ttlMs 1000ms, <= staleMs 5000ms)
      now = 3000;
      const staleVal = await cache.get("err", async () => "refreshed");
      assert.equal(staleVal, "ok");
      await new Promise((r) => setTimeout(r, 10));
      const refreshedVal = await cache.get("err", async () => "unused");
      assert.equal(refreshedVal, "refreshed");
    });
  });

  describe("Async hostlogs helpers (CY-A10 / CY-12)", () => {
    test("newestPm2LogAsync, resolveHostLogsAsync, and isReadableAsync work without sync I/O", async () => {
      const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "cy-hostlogs-"));
      try {
        const older = path.join(tmp, "containeryard-api-out-1.log");
        const newer = path.join(tmp, "containeryard-api-out.log");
        await fs.promises.writeFile(older, "old\n");
        await fs.promises.utimes(older, new Date(1000), new Date(1000));
        await fs.promises.writeFile(newer, "new\n");

        const picked = await newestPm2LogAsync("out", tmp, "containeryard-api");
        assert.equal(picked, newer);
        assert.equal(await isReadableAsync(newer), true);
        assert.equal(await isReadableAsync(path.join(tmp, "missing.log")), false);

        const resolved = await resolveHostLogsAsync("local", {
          CY_LOCAL_HOST_ID: "local",
          HOSTLOG_NGINX_DIR: tmp,
          PM2_LOG_DIR: tmp,
          PM2_APP_NAME: "containeryard-api",
        });
        assert.equal(resolved.pm2_out, newer);
        assert.equal(resolved.nginx_access, path.join(tmp, "access.log"));
      } finally {
        await fs.promises.rm(tmp, { recursive: true, force: true });
      }
    });
  });
});
