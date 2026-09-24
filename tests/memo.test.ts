import { describe, expect, it } from "vitest";
import { createMemo } from "../src/support/memo";

describe("remembering what was worked out", () => {
  it("gives back what was put in", () => {
    const memo = createMemo<string, number>(4);
    memo.set("mean", 3);

    expect(memo.get("mean")).toBe(3);
  });

  it("has nothing for what was never put in", () => {
    expect(createMemo<string, number>(4).get("mean")).toBeUndefined();
  });

  it("forgets the least recently used answer when it is full", () => {
    const memo = createMemo<string, number>(2);
    memo.set("mean", 1);
    memo.set("k1", 2);
    memo.set("k2", 3);

    expect(memo.get("mean")).toBeUndefined();
    expect(memo.get("k1")).toBe(2);
    expect(memo.size).toBe(2);
  });

  it("counts being asked for as a use", () => {
    const memo = createMemo<string, number>(2);
    memo.set("mean", 1);
    memo.set("k1", 2);

    memo.get("mean");
    memo.set("k2", 3);

    expect(memo.get("mean")).toBe(1);
    expect(memo.get("k1")).toBeUndefined();
  });

  it("keeps a value that is set again the newest", () => {
    const memo = createMemo<string, number>(2);
    memo.set("mean", 1);
    memo.set("k1", 2);
    memo.set("mean", 9);
    memo.set("k2", 3);

    // Setting a value again makes it the newest, so the one forgotten is the one left behind.
    expect(memo.get("mean")).toBe(9);
    expect(memo.get("k2")).toBe(3);
    expect(memo.get("k1")).toBeUndefined();
  });
});
