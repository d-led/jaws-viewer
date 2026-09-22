import { describe, expect, it } from "vitest";
import { sniffBundleFile } from "../src/parsing/sniff";
import { asciiStl, binaryStl, textBytes, zipOf } from "./fixtures";

describe("identifying files by their content", () => {
  it("recognises a zip archive", () => {
    expect(sniffBundleFile(zipOf({ "a.txt": "hello" }))).toBe("zip");
  });

  it('recognises a binary STL even when its header starts with "solid"', () => {
    expect(sniffBundleFile(binaryStl(4))).toBe("binary-stl");
  });

  it("recognises a text STL", () => {
    expect(sniffBundleFile(asciiStl(2))).toBe("ascii-stl");
  });

  it("recognises XML, with or without a declaration or byte order mark", () => {
    expect(
      sniffBundleFile(textBytes('<?xml version="1.0"?><Treatment/>')),
    ).toBe("xml");
    expect(sniffBundleFile(textBytes("<Matrix4/>"))).toBe("xml");
    expect(sniffBundleFile(textBytes("\uFEFF<Matrix4/>"))).toBe("xml");
  });

  it("gives up on anything it cannot place", () => {
    expect(sniffBundleFile(textBytes("just some notes\n"))).toBe("unknown");
    expect(sniffBundleFile(new Uint8Array())).toBe("unknown");
  });

  it("does not mistake an ordinary file for a binary STL", () => {
    // 84 + 50n has to match the length exactly, so a stray three bytes cannot fool it.
    expect(sniffBundleFile(textBytes("solid but truncated"))).toBe("ascii-stl");
  });
});
