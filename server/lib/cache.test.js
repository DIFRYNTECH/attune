import assert from "node:assert/strict";
import test from "node:test";

import { makeTtlCache } from "./cache.js";

test("TTL cache returns null for missing keys and stored values before expiry", () => {
  const cache = makeTtlCache({ ttlMs: 1000, maxEntries: 2, now: () => 10 });

  assert.equal(cache.get("missing"), null);
  cache.set("a", { value: 1 });
  assert.deepEqual(cache.get("a"), { value: 1 });
});

test("TTL cache expires stale entries", () => {
  let now = 100;
  const cache = makeTtlCache({ ttlMs: 50, maxEntries: 2, now: () => now });

  cache.set("a", "first");
  now = 151;

  assert.equal(cache.get("a"), null);
});

test("TTL cache evicts the oldest entry when max entries is reached", () => {
  const cache = makeTtlCache({ ttlMs: 1000, maxEntries: 2, now: () => 10 });

  cache.set("a", "first");
  cache.set("b", "second");
  cache.set("c", "third");

  assert.equal(cache.get("a"), null);
  assert.equal(cache.get("b"), "second");
  assert.equal(cache.get("c"), "third");
});
