// @vitest-environment jsdom

import React from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetMockCache } from "./raycast-api-mock";
import { useCachedPromise } from "../src/useCachedPromise";
import type { UseCachedPromiseReturnType } from "../src/types";

describe("useCachedPromise", () => {
  beforeEach(resetMockCache);
  afterEach(cleanup);

  it("keeps custom rollback data scoped to the mutation's cache key", async () => {
    const load = async (key: string) => key;
    let mutate: UseCachedPromiseReturnType<string, undefined>["mutate"];
    let renderedData: string | undefined;

    function Probe({ cacheKey }: { cacheKey: string }) {
      const result = useCachedPromise(load, [cacheKey]);
      mutate = result.mutate;
      renderedData = result.data;
      return null;
    }

    const view = render(<Probe cacheKey="a" />);
    await waitFor(() => expect(renderedData).toBe("a"));

    let rejectMutation: (error: Error) => void = () => undefined;
    const update = new Promise<never>((_resolve, reject) => {
      rejectMutation = reject;
    });
    let rollbackData: string | undefined;
    let mutation!: Promise<unknown>;
    await act(async () => {
      mutation = mutate(update, {
        optimisticUpdate: (data) => `${data}+optimistic`,
        rollbackOnError: (data) => {
          rollbackData = data;
          return "a-rolled-back";
        },
        shouldRevalidateAfter: false,
      }).catch((error) => error);
    });

    view.rerender(<Probe cacheKey="b" />);
    await waitFor(() => expect(renderedData).toBe("b"));

    await act(async () => {
      rejectMutation(new Error("failed"));
      await mutation;
    });

    expect(rollbackData).toBe("a+optimistic");
    expect(renderedData).toBe("b");

    view.rerender(<Probe cacheKey="a" />);
    await waitFor(() => expect(renderedData).toBe("a-rolled-back"));
  });
});
