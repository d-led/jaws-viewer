import { describe, expect, it } from "vitest";
import { underBase } from "../src/io/sample-bundle";

describe("finding the sample under the base the site is served from", () => {
  it("keeps a project site's base, which arrives without a trailing slash", () => {
    expect(underBase("/jaws-viewer", "sample/index.json")).toBe(
      "/jaws-viewer/sample/index.json",
    );
  });

  it("leaves a base that already ends in a slash alone", () => {
    expect(underBase("/jaws-viewer/", "sample/index.json")).toBe(
      "/jaws-viewer/sample/index.json",
    );
  });

  it("reads the root as the root, however it is written", () => {
    expect(underBase("/", "sample/index.json")).toBe("/sample/index.json");
    expect(underBase("", "sample/index.json")).toBe("/sample/index.json");
  });
});
