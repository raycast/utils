// @vitest-environment jsdom

import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMockCacheEntryCount, resetMockCache } from "./raycast-api-mock";

import { useFetch } from "../src/useFetch";

describe("useFetch", () => {
  beforeEach(resetMockCache);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("uses the Request body as part of the cache identity", async () => {
    const fetchMock = vi.fn(async (request: string | URL | Request) => {
      const body = request instanceof Request ? await request.text() : "";
      return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    function Probe({ request }: { request: Request }) {
      useFetch<string>(request);
      return null;
    }

    const firstRequest = new Request("https://example.com", { method: "POST", body: "first" });
    const secondRequest = new Request("https://example.com", { method: "POST", body: "second" });
    const view = render(<Probe request={firstRequest} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    view.rerender(<Probe request={secondRequest} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getMockCacheEntryCount()).toBe(2));
  });

  it("combines caller and internal abort signals", async () => {
    let fetchSignal: AbortSignal | null | undefined;
    const fetchMock = vi.fn(async (_request: string | URL | Request, options?: RequestInit) => {
      fetchSignal = options?.signal;
      return new Response(JSON.stringify("done"), { headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    function Probe() {
      useFetch<string>("https://example.com", { signal: controller.signal });
      return null;
    }

    render(<Probe />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchSignal?.aborted).toBe(false);

    controller.abort();
    expect(fetchSignal?.aborted).toBe(true);
  });
});
