// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as sql from "../src/sql-utils";
import { useSQL } from "../src/useSQL";

describe("useSQL cancellation", () => {
  const executeSQL = vi.spyOn(sql, "baseExecuteSQL");

  beforeEach(() => {
    executeSQL.mockReset();
    executeSQL.mockImplementation(
      (_databasePath, _query, options) =>
        new Promise<never>((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          });
        }),
    );
  });

  afterEach(cleanup);

  it.each([
    { databasePath: "first.db", query: "SELECT 2" },
    { databasePath: "second.db", query: "SELECT 1" },
  ])("aborts the previous query when arguments change to $databasePath / $query", async (nextArgs) => {
    const onError = vi.fn();
    const { rerender, unmount } = renderHook(({ databasePath, query }) => useSQL(databasePath, query, { onError }), {
      initialProps: { databasePath: "first.db", query: "SELECT 1" },
    });
    const firstSignal = executeSQL.mock.calls[0][2]?.signal;
    expect(firstSignal?.aborted).toBe(false);

    await act(async () => rerender(nextArgs));

    expect(executeSQL).toHaveBeenCalledTimes(2);
    expect(firstSignal?.aborted).toBe(true);
    const nextSignal = executeSQL.mock.calls[1][2]?.signal;
    expect(nextSignal).not.toBe(firstSignal);
    expect(nextSignal?.aborted).toBe(false);
    expect(onError).not.toHaveBeenCalled();

    await act(async () => unmount());
    expect(nextSignal?.aborted).toBe(true);
    expect(onError).not.toHaveBeenCalled();
  });

  it("aborts an in-flight query when execution is disabled", async () => {
    const { rerender } = renderHook(({ execute }) => useSQL("first.db", "SELECT 1", { execute }), {
      initialProps: { execute: true },
    });
    const signal = executeSQL.mock.calls[0][2]?.signal;
    expect(signal?.aborted).toBe(false);

    await act(async () => rerender({ execute: false }));

    expect(signal?.aborted).toBe(true);
    expect(executeSQL).toHaveBeenCalledTimes(1);
  });
});
