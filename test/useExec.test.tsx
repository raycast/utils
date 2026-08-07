// @vitest-environment jsdom

import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetMockCache } from "./raycast-api-mock";

import { useExec } from "../src/useExec";

describe("useExec", () => {
  beforeEach(resetMockCache);
  afterEach(cleanup);

  it("closes stdin when no input is supplied", async () => {
    let data: string | undefined;

    function Probe() {
      useExec(
        process.execPath,
        ["-e", "process.stdin.resume(); process.stdin.on('end', () => process.stdout.write('closed'))"],
        { timeout: 1_000, onData: (result) => void (data = result) },
      );
      return null;
    }

    render(<Probe />);
    await waitFor(() => expect(data).toBe("closed"));
  });
});
