// @vitest-environment jsdom

import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetMockCache } from "./raycast-api-mock";

import { useCachedState } from "../src/useCachedState";

describe("useCachedState", () => {
  beforeEach(resetMockCache);
  afterEach(cleanup);

  it("composes immediate functional updates", async () => {
    let update: React.Dispatch<React.SetStateAction<number>> = () => undefined;
    function Probe() {
      const [value, setValue] = useCachedState("counter", 0);
      update = setValue;
      return <>{value}</>;
    }

    const view = render(<Probe />);
    await act(async () => {
      update((value) => value + 1);
      update((value) => value + 1);
    });

    expect(view.container.textContent).toBe("2");
  });

  it("keeps an asynchronous setter scoped to its original key", async () => {
    const setters = new Map<string, React.Dispatch<React.SetStateAction<number>>>();
    function Probe({ cacheKey }: { cacheKey: string }) {
      const [value, setValue] = useCachedState(cacheKey, 0);
      setters.set(cacheKey, setValue);
      return <>{value}</>;
    }

    const view = render(<Probe cacheKey="a" />);
    const staleSetter = setters.get("a")!;
    await act(async () => {
      view.rerender(<Probe cacheKey="b" />);
    });
    await act(async () => {
      staleSetter(7);
    });

    expect(view.container.textContent).toBe("0");
    await act(async () => {
      view.rerender(<Probe cacheKey="a" />);
    });
    expect(view.container.textContent).toBe("7");
  });
});
