import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { newestPm2Log } from "../../src/config/hostlogs";

test("newestPm2Log picks the most recently written matching file, ignoring .gz and other apps", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pm2logs-"));
  const touch = (name: string, ageSec: number) => {
    const f = path.join(dir, name);
    fs.writeFileSync(f, "x");
    const t = Date.now() / 1000 - ageSec;
    fs.utimesSync(f, t, t);
  };
  try {
    touch("containeryard-api-out.log", 3000);            // stale, unsuffixed
    touch("containeryard-api-out-9.log", 10);            // current
    touch("containeryard-api-out-9__2026-10-25.log.gz", 1); // rotated archive
    touch("containeryard-out.log", 1);                   // different (old) app name
    touch("containeryard-api-error-9.log", 5);
    assert.equal(newestPm2Log("out", dir, "containeryard-api"), path.join(dir, "containeryard-api-out-9.log"));
    assert.equal(newestPm2Log("error", dir, "containeryard-api"), path.join(dir, "containeryard-api-error-9.log"));
    assert.equal(newestPm2Log("out", path.join(dir, "missing"), "containeryard-api"), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

import { parseSince } from "../../src/services/docker";

test("parseSince handles seconds, durations, ISO and junk", () => {
  const now = Date.parse("2026-11-07T12:00:00Z");
  const nowSec = now / 1000;
  assert.equal(parseSince(3600, now), nowSec - 3600);
  assert.equal(parseSince("3600", now), nowSec - 3600);
  assert.equal(parseSince("3600s", now), nowSec - 3600); // what the drawer sends
  assert.equal(parseSince("15m", now), nowSec - 900);
  assert.equal(parseSince("2h", now), nowSec - 7200);
  assert.equal(parseSince("1d", now), nowSec - 86400);
  assert.equal(parseSince("2026-11-07T11:00:00Z", now), nowSec - 3600);
  assert.equal(parseSince("", now), undefined);
  assert.equal(parseSince("0", now), undefined);
  assert.equal(parseSince("garbage", now), undefined);
  assert.equal(parseSince(undefined, now), undefined);
});
