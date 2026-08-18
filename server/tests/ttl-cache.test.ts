import { afterEach, describe, expect, it, vi } from "vitest";
import { TtlCache } from "../src/utils/ttl-cache.js";

describe("TtlCache", () => {
  afterEach(() => vi.useRealTimers());

  it("expires entries after the configured lifetime", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T12:00:00Z"));
    const cache = new TtlCache<string>(2, 1_000);
    cache.set("key", "value");

    vi.advanceTimersByTime(999);
    expect(cache.get("key")).toBe("value");
    vi.advanceTimersByTime(1);
    expect(cache.get("key")).toBeUndefined();
  });

  it("evicts the least recently used entry at capacity", () => {
    const cache = new TtlCache<number>(2, 60_000);
    cache.set("first", 1);
    cache.set("second", 2);
    expect(cache.get("first")).toBe(1);
    cache.set("third", 3);

    expect(cache.get("second")).toBeUndefined();
    expect(cache.get("first")).toBe(1);
    expect(cache.get("third")).toBe(3);
  });
});
