import "./_testEnv";
import { test } from "node:test";
import assert from "node:assert/strict";
import { cadvisorInspectSpec } from "../../src/routes/inspect";

const ID = "/system.slice/docker-0123456789abcdef.scope";

test("cAdvisor inspect: alias name, image, labels and the latest memory limit", () => {
  const spec = cadvisorInspectSpec(
    {
      id: "0123456789abcdef",
      name: ID,
      aliases: ["/docker/plex", "0123456789abcdef"],
      spec: { image: "plexinc/pms-docker", labels: { a: "b" }, memory: { limit: 1 }, cpu: { limit: 1024 } },
      stats: [{ memory: { limit: 100 } }, { memory: { limit: 200 } }],
    },
    ID,
  );
  assert.deepEqual(spec, {
    id: "0123456789abcdef",
    name: "plex",
    image: "plexinc/pms-docker",
    labels: { a: "b" },
    resources: { memLimitBytes: 200, cpuShares: 1024 },
  });
});

test("cAdvisor inspect: falls back to the spec limit, the name and the request id", () => {
  const spec = cadvisorInspectSpec({ name: "/docker/abc", spec: { memory: { limit: 512 } } }, ID);
  assert.equal(spec.id, ID);
  assert.equal(spec.name, "abc");
  assert.equal(spec.image, null);
  assert.deepEqual(spec.labels, {});
  assert.deepEqual(spec.resources, { memLimitBytes: 512, cpuShares: null });
});

test("cAdvisor inspect: an empty or null body never throws", () => {
  for (const body of [null, undefined, {}, { stats: [] }]) {
    assert.deepEqual(cadvisorInspectSpec(body, ID), {
      id: ID,
      name: "",
      image: null,
      labels: {},
      resources: { memLimitBytes: null, cpuShares: null },
    });
  }
});

test("cAdvisor inspect: a cgroup v2 container without aliases is named by its id", () => {
  const id = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const path = `/system.slice/docker-${id}.scope`;
  assert.equal(cadvisorInspectSpec({ name: path }, path).name, id);
});
