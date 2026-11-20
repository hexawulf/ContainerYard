import { test } from "node:test";
import assert from "node:assert/strict";
import { getStackByName, groupContainersByStack } from "../../src/models/stacks";
import type { ContainerSummary } from "../../src/models/containers";

function c(name: string, state: string, composeProject: string | null): ContainerSummary {
  return {
    id: `${name}-id`,
    hostId: "local",
    provider: "DOCKER",
    name,
    image: "img",
    state,
    status: state,
    node: "local",
    createdAt: "2026-11-20T00:00:00.000Z",
    labels: {},
    networks: [],
    ports: [],
    composeProject,
  };
}

const ALL = [
  c("shop-web", "running", "shop"),
  c("shop-db", "running", "shop"),
  c("blog-web", "running", "blog"),
  c("blog-db", "exited", "blog"),
  c("blog-cache", "paused", "blog"),
  c("blog-worker", "restarting", "blog"),
  c("old-a", "exited", "old"),
  c("old-b", "exited", "old"),
  c("lonely", "running", null),
  c("empty-project", "running", ""),
];

test("containers are grouped by compose project; others are standalone", () => {
  const { stacks, standaloneContainers } = groupContainersByStack(ALL);
  assert.deepEqual(stacks.map((s) => s.name), ["shop", "blog", "old"]);
  // An empty project label is treated as "no project".
  assert.deepEqual(standaloneContainers.map((x) => x.name), ["lonely", "empty-project"]);
});

test("per-state counts and health", () => {
  const { stacks } = groupContainersByStack(ALL);
  const by = Object.fromEntries(stacks.map((s) => [s.name, s]));
  assert.equal(by.shop.healthStatus, "healthy");
  assert.equal(by.old.healthStatus, "unhealthy");
  assert.deepEqual(
    {
      health: by.blog.healthStatus,
      total: by.blog.containerCount,
      running: by.blog.runningCount,
      stopped: by.blog.stoppedCount,
      paused: by.blog.pausedCount,
      restarting: by.blog.restartingCount,
    },
    { health: "partial", total: 4, running: 1, stopped: 1, paused: 1, restarting: 1 },
  );
});

test("no containers → no stacks", () => {
  assert.deepEqual(groupContainersByStack([]), { stacks: [], standaloneContainers: [] });
});

test("getStackByName finds one stack or nothing", () => {
  assert.equal(getStackByName(ALL, "blog")?.containerCount, 4);
  assert.equal(getStackByName(ALL, "nope"), undefined);
  assert.equal(getStackByName(ALL, ""), undefined);
});
