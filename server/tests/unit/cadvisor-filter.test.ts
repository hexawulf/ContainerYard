import { test } from "node:test";
import assert from "node:assert/strict";
import { isDockerContainerPath } from "../../src/services/cadvisor";

const ID = "8036d207e562a1b2c3d4e5f60718293a4b5c6d7e8f9012345678901234567890";

test("isDockerContainerPath keeps Docker containers on cgroup v1 and v2", () => {
  assert.equal(isDockerContainerPath(`/docker/${ID}`), true);
  assert.equal(isDockerContainerPath(`/system.slice/docker-${ID}.scope`), true);
});

test("isDockerContainerPath drops NAS parent cgroup and daemon units", () => {
  assert.equal(isDockerContainerPath("/docker"), false);
  assert.equal(isDockerContainerPath("/system.slice/pkg-ContainerManager-dockerd.service"), false);
  assert.equal(isDockerContainerPath("/system.slice/docker.service"), false);
  assert.equal(isDockerContainerPath("/system.slice/sshd.service"), false);
  assert.equal(isDockerContainerPath("/"), false);
});
