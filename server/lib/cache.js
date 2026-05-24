export function makeTtlCache({ ttlMs, maxEntries, now = Date.now }) {
  const cache = new Map();

  function get(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now()) {
      cache.delete(key);
      return null;
    }
    return entry.value;
  }

  function set(key, value) {
    if (cache.size >= maxEntries) {
      const first = cache.keys().next().value;
      if (first) cache.delete(first);
    }
    cache.set(key, { expiresAt: now() + ttlMs, value });
  }

  return { get, set };
}
