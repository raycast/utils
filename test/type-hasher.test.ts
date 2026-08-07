import { describe, expect, it } from "vitest";
import { hash } from "../src/helpers";

describe("typeHasher", () => {
  it("hashes native Fetch objects without throwing", () => {
    const controller = new AbortController();
    const values = [
      new Headers({ authorization: "Bearer token" }),
      new Request("https://example.com", { headers: { accept: "application/json" } }),
      controller.signal,
      new Blob(["hello"], { type: "text/plain" }),
      new FormData(),
      new ReadableStream(),
    ];

    for (const value of values) {
      expect(() => hash(value)).not.toThrow();
    }
  });

  it("does not collapse binary buffers with different bytes", () => {
    expect(hash(Buffer.from([0xc3]))).not.toBe(hash(Buffer.from([0xef])));
  });
});
