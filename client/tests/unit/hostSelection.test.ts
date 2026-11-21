import { test } from "node:test";
import assert from "node:assert/strict";
import type { HostSummary } from "../../../shared/monitoring";
import {
  HOST_STORAGE_KEY,
  hostDisplayName,
  hostLogsPath,
  readStoredHostId,
  storeHostId,
} from "../../src/lib/hostSelection";

const hosts: HostSummary[] = [
  { id: "host-a", name: "host-a", provider: "DOCKER", nodeLabel: "local" },
  { id: "host-b", name: "Host Bravo", provider: "CADVISOR_ONLY", nodeLabel: "remote" },
];

/** Swap globalThis.localStorage for the duration of one test. */
function withStorage(
  storage: Pick<Storage, "getItem" | "setItem"> | undefined,
  run: () => void,
) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });
  try {
    run();
  } finally {
    if (original) {
      Object.defineProperty(globalThis, "localStorage", original);
    } else {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  }
}

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    store: map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

test("hostLogsPath encodes the host id", () => {
  assert.equal(hostLogsPath("host-a"), "/hosts/host-a/logs");
  assert.equal(hostLogsPath("a/b"), "/hosts/a%2Fb/logs");
  assert.equal(hostLogsPath("a b"), "/hosts/a%20b/logs");
});

test("hostDisplayName returns the name for a known id, the id otherwise", () => {
  assert.equal(hostDisplayName(hosts, "host-a"), "host-a");
  assert.equal(hostDisplayName(hosts, "host-b"), "Host Bravo");
  assert.equal(hostDisplayName(hosts, "nope"), "nope");
  assert.equal(hostDisplayName([], "nope"), "nope");
});

test("readStoredHostId / storeHostId round-trip through storage", () => {
  const storage = memoryStorage();
  withStorage(storage, () => {
    assert.equal(readStoredHostId(), null);
    storeHostId("host-b");
    assert.equal(storage.store.get(HOST_STORAGE_KEY), "host-b");
    assert.equal(readStoredHostId(), "host-b");
  });
});

test("readStoredHostId / storeHostId never throw when storage throws", () => {
  const throwingStorage = {
    getItem() {
      throw new Error("storage blocked");
    },
    setItem() {
      throw new Error("storage blocked");
    },
  };
  withStorage(throwingStorage, () => {
    assert.equal(readStoredHostId(), null);
    assert.doesNotThrow(() => storeHostId("host-a"));
  });
});

test("readStoredHostId / storeHostId never throw when storage is absent", () => {
  withStorage(undefined, () => {
    assert.equal(readStoredHostId(), null);
    assert.doesNotThrow(() => storeHostId("host-a"));
  });
});
