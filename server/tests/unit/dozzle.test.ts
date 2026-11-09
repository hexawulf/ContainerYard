import { test } from "node:test";
import assert from "node:assert/strict";
import { dockerIdFromCadvisorPath, dozzleContainerLink } from "../../src/config/dozzle";

const ID = "f7297094409f3436529eb1b533dd5aa0c775320b1920d5adc9a3575929280305";

test("dockerIdFromCadvisorPath handles cgroup v1, v2 and bare IDs", () => {
  assert.equal(dockerIdFromCadvisorPath(`/docker/${ID}`), "f7297094409f");
  assert.equal(dockerIdFromCadvisorPath(`/system.slice/docker-${ID}.scope`), "f7297094409f");
  assert.equal(dockerIdFromCadvisorPath(encodeURIComponent(`/docker/${ID}`)), "f7297094409f");
  assert.equal(dockerIdFromCadvisorPath(ID), "f7297094409f");
  assert.equal(dockerIdFromCadvisorPath("/system.slice/sshd.service"), null);
});

test("dozzleContainerLink builds /container/<short id> without hash routing", () => {
  assert.equal(dozzleContainerLink("https://dozzle.example.org/", `/docker/${ID}`), "https://dozzle.example.org/container/f7297094409f");
  assert.equal(dozzleContainerLink("https://dozzle.example.org", "/system.slice/sshd.service"), "https://dozzle.example.org");
});
