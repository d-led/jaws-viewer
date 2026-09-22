import { describe, expect, it } from "vitest";
import { readStlTriangleCount } from "../src/parsing/stl";
import { sniffBundleFile } from "../src/parsing/sniff";
import { asciiStl, binaryStl } from "./fixtures";

function countOf(bytes: Uint8Array): number | null {
  return readStlTriangleCount(bytes, sniffBundleFile(bytes));
}

describe("counting triangles before rendering", () => {
  it("reads the count from a binary STL header", () => {
    expect(countOf(binaryStl(4711))).toBe(4711);
  });

  it("counts the facets of a text STL", () => {
    expect(countOf(asciiStl(6))).toBe(6);
  });

  it("reports nothing for a file that is not an STL", () => {
    expect(
      readStlTriangleCount(new TextEncoder().encode("<Matrix4/>"), "xml"),
    ).toBeNull();
  });
});
