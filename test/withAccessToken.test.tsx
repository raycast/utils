// @vitest-environment jsdom

import React, { Suspense } from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getAccessToken, withAccessToken } from "../src/oauth/withAccessToken";

describe("withAccessToken", () => {
  afterEach(cleanup);

  it("keeps getAccessToken as a plain synchronous getter", async () => {
    const authorize = vi.fn(async () => "secret");
    let tokenReadDuringRender: ReturnType<typeof getAccessToken> | undefined;

    function AuthorizedComponent() {
      tokenReadDuringRender = getAccessToken();
      return null;
    }

    const WrappedComponent = withAccessToken({ authorize })(AuthorizedComponent);
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <WrappedComponent />
        </Suspense>,
      );
    });

    await waitFor(() => expect(tokenReadDuringRender).toEqual({ token: "secret", type: "oauth" }));
    expect(getAccessToken()).toEqual({ token: "secret", type: "oauth" });
    expect(authorize).toHaveBeenCalledTimes(1);
  });
});
