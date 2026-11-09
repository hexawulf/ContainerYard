import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRemoteHostsEnv } from "../../src/config/remoteHosts";

const SECRET_LOOKING = "http://do-not-echo.example.internal:8080";

test("CY_REMOTE_HOSTS: empty or unset means no remote hosts", () => {
  assert.deepEqual(parseRemoteHostsEnv(undefined), []);
  assert.deepEqual(parseRemoteHostsEnv(""), []);
  assert.deepEqual(parseRemoteHostsEnv("   "), []);
  assert.deepEqual(parseRemoteHostsEnv("[]"), []);
});

test("CY_REMOTE_HOSTS: valid entries parse, dozzleUrl optional", () => {
  const hosts = parseRemoteHostsEnv(
    JSON.stringify([
      { id: "edge-01", name: "Edge 01", cadvisorUrl: "http://cadvisor.example.internal:8080" },
      { id: "nas-01", name: "NAS 01", cadvisorUrl: "http://nas.example.internal:9818", dozzleUrl: "https://dozzle.example.internal" },
    ]),
  );
  assert.equal(hosts.length, 2);
  assert.equal(hosts[0].dozzleUrl, undefined);
  assert.equal(hosts[1].dozzleUrl, "https://dozzle.example.internal");
});

test("CY_REMOTE_HOSTS: rejects bad JSON and non-arrays", () => {
  assert.throws(() => parseRemoteHostsEnv("{not json"), /must be a valid JSON array/);
  assert.throws(() => parseRemoteHostsEnv('{"id":"x"}'), /must be a JSON array/);
  assert.throws(() => parseRemoteHostsEnv('["x"]'), /CY_REMOTE_HOSTS\[0\]: entry must be an object/);
});

test("CY_REMOTE_HOSTS: names the bad field without echoing values", () => {
  const cases: Array<[unknown, RegExp]> = [
    [{ id: "Bad_ID", name: "x", cadvisorUrl: "http://a.example:1" }, /\[0\]\.id:/],
    [{ id: "a".repeat(33), name: "x", cadvisorUrl: "http://a.example:1" }, /\[0\]\.id:/],
    [{ id: "ok", name: "", cadvisorUrl: "http://a.example:1" }, /\[0\]\.name:/],
    [{ id: "ok", name: "x", cadvisorUrl: "not a url do-not-echo" }, /\[0\]\.cadvisorUrl:/],
    [{ id: "ok", name: "x", cadvisorUrl: SECRET_LOOKING, dozzleUrl: "nope do-not-echo" }, /\[0\]\.dozzleUrl:/],
    [{ id: "ok", name: "x" }, /\[0\]\.cadvisorUrl:/],
  ];
  for (const [entry, rx] of cases) {
    assert.throws(
      () => parseRemoteHostsEnv(JSON.stringify([entry])),
      (err: Error) => {
        assert.match(err.message, rx);
        assert.doesNotMatch(err.message, /do-not-echo/);
        return true;
      },
    );
  }
});

test("CY_REMOTE_HOSTS: ids must be unique, including against the local host id", () => {
  const dup = JSON.stringify([
    { id: "edge-01", name: "A", cadvisorUrl: "http://a.example:1" },
    { id: "edge-01", name: "B", cadvisorUrl: "http://b.example:1" },
  ]);
  assert.throws(() => parseRemoteHostsEnv(dup), /\[1\]\.id: duplicate host id/);
  const clash = JSON.stringify([{ id: "local", name: "A", cadvisorUrl: "http://a.example:1" }]);
  assert.throws(() => parseRemoteHostsEnv(clash, "local"), /\[0\]\.id: duplicate host id/);
});
