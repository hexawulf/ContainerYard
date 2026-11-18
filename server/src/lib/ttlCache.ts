/**
 * Tiny in-process TTL cache with in-flight de-duplication (singleflight) and
 * bounded stale-while-revalidate.
 *
 * Used for expensive Docker fan-outs (one stats call per running container,
 * ~1-2 s each because Docker samples CPU over an interval). Several dashboard
 * widgets and tabs poll the same data every 2-4 s; without this each poll
 * re-ran the whole fan-out.
 *
 *  - age <= ttlMs:          cached value returned.
 *  - ttlMs < age <= staleMs: cached value returned, one background refresh started.
 *  - age > staleMs / miss:  caller awaits a fresh load; concurrent callers share it.
 *
 * Errors are never cached. `invalidate(prefix)` drops entries immediately
 * (used after container actions so the next read is fresh).
 */
interface Entry<T> {
  value?: T;
  at: number;
  inflight?: Promise<T>;
}

export interface TtlCacheOptions {
  ttlMs: number;
  staleMs?: number;
  maxEntries?: number;
  now?: () => number;
}

export class TtlCache {
  private entries = new Map<string, Entry<unknown>>();
  private readonly ttlMs: number;
  private readonly staleMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(opts: TtlCacheOptions) {
    this.ttlMs = opts.ttlMs;
    this.staleMs = Math.max(opts.staleMs ?? opts.ttlMs, opts.ttlMs);
    this.maxEntries = opts.maxEntries ?? 500;
    this.now = opts.now ?? Date.now;
  }

  async get<T>(key: string, load: () => Promise<T>): Promise<T> {
    const entry = this.entries.get(key) as Entry<T> | undefined;
    const t = this.now();
    if (entry && entry.value !== undefined) {
      const age = t - entry.at;
      if (age <= this.ttlMs) return entry.value;
      if (age <= this.staleMs) {
        if (!entry.inflight) this.start(key, entry, load).catch(() => undefined);
        return entry.value;
      }
    }
    if (entry?.inflight) return entry.inflight;
    const fresh: Entry<T> = entry ?? { at: 0 };
    if (!entry) this.set(key, fresh);
    return this.start(key, fresh, load);
  }

  private start<T>(key: string, entry: Entry<T>, load: () => Promise<T>): Promise<T> {
    const p = (async () => {
      try {
        const value = await load();
        // Only store if this entry was not invalidated meanwhile.
        if (this.entries.get(key) === entry) {
          entry.value = value;
          entry.at = this.now();
        }
        return value;
      } finally {
        entry.inflight = undefined;
        if (entry.value === undefined && this.entries.get(key) === entry) {
          this.entries.delete(key);
        }
      }
    })();
    entry.inflight = p;
    return p;
  }

  private set(key: string, entry: Entry<unknown>) {
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, entry);
  }

  invalidate(prefix = ""): void {
    for (const key of Array.from(this.entries.keys())) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

/** Shared cache for Docker/cAdvisor stats fan-outs. */
export const statsCache = new TtlCache({ ttlMs: 2_000, staleMs: 10_000 });
