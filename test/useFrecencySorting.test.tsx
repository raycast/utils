// @vitest-environment jsdom

import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cache, resetMockCache } from "./raycast-api-mock";

import { useFrecencySorting } from "../src/useFrecencySorting";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-01-01T00:00:00.000Z").getTime();

type Item = { id: string };

function Probe({ items }: { items: Item[] }) {
  const { data } = useFrecencySorting(items, { namespace: "test" });
  return <>{data.map((item) => item.id).join(",")}</>;
}

describe("useFrecencySorting", () => {
  beforeEach(() => {
    resetMockCache();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("ranks a recent visit above an old one with the same score", () => {
    new Cache().set(
      "raycast_frecency_test",
      JSON.stringify({
        old: { lastVisited: NOW - 365 * MS_PER_DAY, frecency: 100 },
        recent: { lastVisited: NOW - MS_PER_DAY, frecency: 100 },
      }),
    );

    const view = render(<Probe items={[{ id: "old" }, { id: "recent" }]} />);

    expect(view.container.textContent).toBe("recent,old");
  });

  it("lets an item visited a few times recently outrank one visited a few more times long ago", async () => {
    let visit: (item: Item) => Promise<void> = async () => undefined;
    function VisitProbe({ items }: { items: Item[] }) {
      const { data, visitItem } = useFrecencySorting(items, { namespace: "test" });
      visit = visitItem;
      return <>{data.map((item) => item.id).join(",")}</>;
    }

    const view = render(<VisitProbe items={[{ id: "stale" }, { id: "fresh" }]} />);

    // "stale" is visited 4 times, 60 days ago
    vi.setSystemTime(NOW - 60 * MS_PER_DAY);
    for (let i = 0; i < 4; i++) {
      await act(() => visit({ id: "stale" }));
    }

    // "fresh" is visited twice, today
    vi.setSystemTime(NOW);
    for (let i = 0; i < 2; i++) {
      await act(() => visit({ id: "fresh" }));
    }

    expect(view.container.textContent).toBe("fresh,stale");
  });

  it("still ranks the more frequently visited item first when visits are equally recent", () => {
    new Cache().set(
      "raycast_frecency_test",
      JSON.stringify({
        once: { lastVisited: NOW - MS_PER_DAY, frecency: 100 },
        often: { lastVisited: NOW - MS_PER_DAY, frecency: 300 },
      }),
    );

    const view = render(<Probe items={[{ id: "once" }, { id: "never" }, { id: "often" }]} />);

    expect(view.container.textContent).toBe("often,once,never");
  });
});
