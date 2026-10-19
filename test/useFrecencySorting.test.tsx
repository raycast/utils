// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, resetMockCache } from "./raycast-api-mock";
import { useFrecencySorting } from "../src/useFrecencySorting";

const DAY = 24 * 60 * 60 * 1000;
const HALF_LIFE = 10 * DAY;
const START = Date.UTC(2026, 0, 1);
const CACHE_KEY = "raycast_frecency_undefined";
const cache = new Cache();
const stale = { id: "stale" };
const fresh = { id: "fresh" };
const items = [stale, fresh];

describe("useFrecencySorting", () => {
  beforeEach(() => {
    resetMockCache();
    vi.spyOn(Date, "now").mockReturnValue(START);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("ranks a single visit today above a single visit a year ago", async () => {
    const { result } = renderHook(() => useFrecencySorting(items));
    await act(async () => result.current.visitItem(stale));
    vi.mocked(Date.now).mockReturnValue(START + 365 * DAY);
    await act(async () => result.current.visitItem(fresh));

    expect(result.current.data).toEqual([fresh, stale]);
    expect(items).toEqual([stale, fresh]);
  });

  it("ranks two visits today above four visits sixty days ago", async () => {
    const { result, unmount } = renderHook(() => useFrecencySorting(items));
    for (let i = 0; i < 4; i++) {
      await act(async () => result.current.visitItem(stale));
    }
    vi.mocked(Date.now).mockReturnValue(START + 60 * DAY);
    for (let i = 0; i < 2; i++) {
      await act(async () => result.current.visitItem(fresh));
    }

    expect(result.current.data).toEqual([fresh, stale]);
    unmount();
    const reopened = renderHook(() => useFrecencySorting(items));
    expect(reopened.result.current.data).toEqual([fresh, stale]);
  });

  it("lets frequent recent usage outweigh a more recent single visit", async () => {
    const { result } = renderHook(() => useFrecencySorting([fresh, stale]));
    for (let i = 0; i < 4; i++) {
      await act(async () => result.current.visitItem(stale));
    }
    vi.mocked(Date.now).mockReturnValue(START + DAY);
    await act(async () => result.current.visitItem(fresh));

    expect(result.current.data).toEqual([stale, fresh]);
  });

  it("preserves the relative ranking when both items have been unused for decades", async () => {
    const { result, unmount } = renderHook(() => useFrecencySorting(items));
    await act(async () => result.current.visitItem(stale));
    vi.mocked(Date.now).mockReturnValue(START + DAY);
    await act(async () => result.current.visitItem(fresh));
    unmount();

    vi.mocked(Date.now).mockReturnValue(START + 100 * 365 * DAY);
    const reopened = renderHook(() => useFrecencySorting(items));
    expect(reopened.result.current.data).toEqual([fresh, stale]);
  });

  it("ranks legacy entries correctly without writing to the cache on read", () => {
    const stored = JSON.stringify({
      stale: { lastVisited: START, frecency: 400 },
      fresh: { lastVisited: START + 60 * DAY, frecency: 200 },
    });
    cache.set(CACHE_KEY, stored);
    vi.mocked(Date.now).mockReturnValue(START + 60 * DAY);

    const { result } = renderHook(() => useFrecencySorting(items));

    expect(result.current.data).toEqual([fresh, stale]);
    expect(cache.get(CACHE_KEY)).toBe(stored);
  });

  it("reads mixed legacy entries and timestamps using a custom key and namespace", async () => {
    const key = "raycast_frecency_mixed";
    const timestamp = START + 80 * DAY;
    cache.set(
      key,
      JSON.stringify({
        "item-stale": { lastVisited: START, frecency: 128 },
        "item-fresh": timestamp,
      }),
    );
    const { result, unmount } = renderHook(() =>
      useFrecencySorting(items, { namespace: "mixed", key: (item) => `item-${item.id}` }),
    );

    expect(result.current.data).toEqual([fresh, stale]);
    await act(async () => result.current.resetRanking({ id: "missing" }));
    expect(JSON.parse(cache.get(key)!)).toEqual({
      "item-stale": START + 70 * DAY,
      "item-fresh": timestamp,
    });
    expect(cache.get(CACHE_KEY)).toBeUndefined();

    const migrated = cache.get(key);
    unmount();
    const reopened = renderHook(() =>
      useFrecencySorting(items, { namespace: "mixed", key: (item) => `item-${item.id}` }),
    );
    await act(async () => reopened.result.current.resetRanking({ id: "missing" }));
    expect(cache.get(key)).toBe(migrated);
  });

  it("migrates all entries on a visit and adds to the decayed legacy score", async () => {
    const now = START + 60 * DAY;
    cache.set(
      CACHE_KEY,
      JSON.stringify({
        stale: { lastVisited: START, frecency: 400 },
        fresh: { lastVisited: now, frecency: 200 },
        hidden: { lastVisited: START, frecency: 128 },
      }),
    );
    vi.mocked(Date.now).mockReturnValue(now);
    const { result, unmount } = renderHook(() => useFrecencySorting(items));

    await act(async () => result.current.visitItem(stale));

    const migrated = JSON.parse(cache.get(CACHE_KEY)!);
    expect(Object.keys(migrated).sort()).toEqual(["fresh", "hidden", "stale"]);
    expect(2 ** ((migrated.stale - now) / HALF_LIFE)).toBeCloseTo(106.25);
    expect(2 ** ((migrated.fresh - now) / HALF_LIFE)).toBeCloseTo(200);
    expect(migrated.hidden).toBe(START + 70 * DAY);
    expect(result.current.data).toEqual([fresh, stale]);

    unmount();
    const reopened = renderHook(() => useFrecencySorting(items));
    expect(reopened.result.current.data).toEqual([fresh, stale]);
    await act(async () => reopened.result.current.visitItem(stale));
    expect(reopened.result.current.data).toEqual([stale, fresh]);
    const updated = JSON.parse(cache.get(CACHE_KEY)!);
    expect(2 ** ((updated.stale - now) / HALF_LIFE)).toBeCloseTo(206.25);
  });

  it("migrates on reset and keeps the removed ranking absent after reopening", async () => {
    cache.set(
      CACHE_KEY,
      JSON.stringify({
        stale: { lastVisited: START, frecency: 256 },
        fresh: { lastVisited: START, frecency: 128 },
        hidden: { lastVisited: START, frecency: 64 },
      }),
    );
    const { result, unmount } = renderHook(() => useFrecencySorting(items));
    await act(async () => result.current.resetRanking(stale));

    expect(JSON.parse(cache.get(CACHE_KEY)!)).toEqual({
      fresh: START + 70 * DAY,
      hidden: START + 60 * DAY,
    });
    expect(result.current.data).toEqual([fresh, stale]);

    unmount();
    const reopened = renderHook(() => useFrecencySorting(items));
    expect(reopened.result.current.data).toEqual([fresh, stale]);
  });

  it("preserves immediate updates from multiple hooks while migrating", async () => {
    cache.set(CACHE_KEY, JSON.stringify({ stale: { lastVisited: START, frecency: 100 } }));
    const first = renderHook(() => useFrecencySorting(items));
    const second = renderHook(() => useFrecencySorting(items));
    const firstVisit = first.result.current.visitItem;
    const secondVisit = second.result.current.visitItem;

    await act(async () => {
      await firstVisit(stale);
      await secondVisit(fresh);
      await secondVisit(stale);
    });

    const stored = JSON.parse(cache.get(CACHE_KEY)!);
    expect(2 ** ((stored.stale - START) / HALF_LIFE)).toBeCloseTo(300);
    expect(2 ** ((stored.fresh - START) / HALF_LIFE)).toBeCloseTo(100);
    expect(first.result.current.data).toEqual([stale, fresh]);
    expect(second.result.current.data).toEqual([stale, fresh]);
  });

  it("treats a zero timestamp as a visited item when sorting and updating", async () => {
    cache.set(CACHE_KEY, JSON.stringify({ fresh: 0 }));
    vi.mocked(Date.now).mockReturnValue(0);
    const { result } = renderHook(() => useFrecencySorting(items));

    expect(result.current.data).toEqual([fresh, stale]);
    await act(async () => result.current.visitItem(fresh));
    const stored = JSON.parse(cache.get(CACHE_KEY)!);
    expect(2 ** (stored.fresh / HALF_LIFE)).toBeCloseTo(101);
  });

  it("keeps visited items above unvisited items and applies sortUnvisited only to unvisited items", async () => {
    const a = { id: "a" };
    const b = { id: "b" };
    const c = { id: "c" };
    const { result } = renderHook(() =>
      useFrecencySorting([c, b, a], { sortUnvisited: (a, b) => a.id.localeCompare(b.id) }),
    );
    expect(result.current.data).toEqual([a, b, c]);

    await act(async () => result.current.visitItem(c));
    expect(result.current.data).toEqual([c, a, b]);
    await act(async () => result.current.resetRanking(c));
    expect(result.current.data).toEqual([a, b, c]);
  });
});
