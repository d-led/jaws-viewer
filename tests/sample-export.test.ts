import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { DentalBundle } from "../src/domain/dental-bundle";
import {
  isIdentity,
  translationOf,
  type Matrix4Entries,
} from "../src/domain/matrix4";
import type { BundleFile } from "../src/io/bundle-file";
import { readBundle } from "../src/io/bundle-reader";

/**
 * The bundle that ships with the viewer, read here the same way a dropped folder is.
 *
 * It stands in for a scanner export in the suite, because it carries the file names, the case XML
 * and the transform an export carries. `scripts/make-sample.mjs` writes it, so the test covers the
 * reader end to end without depending on anybody's scans being on the machine.
 */
const SAMPLE_DIRECTORY = join(import.meta.dirname, "..", "public", "sample");

/** The files the bundle lists for the viewer, in the order the bundle itself gives them. */
function sampleFiles(): readonly BundleFile[] {
  const listing: unknown = JSON.parse(
    readFileSync(join(SAMPLE_DIRECTORY, "index.json"), "utf8"),
  );
  const names =
    typeof listing === "object" && listing !== null && "files" in listing
      ? listing.files
      : null;
  if (!Array.isArray(names))
    throw new Error("the sample bundle lists no files");

  return names
    .filter((name): name is string => typeof name === "string")
    .map((name) => ({
      path: name,
      bytes: new Uint8Array(readFileSync(join(SAMPLE_DIRECTORY, name))),
    }));
}

function requireMatrix(bundle: DentalBundle): Matrix4Entries {
  if (bundle.matrix === null)
    throw new Error("The export carries no .matrix4 transform.");
  return bundle.matrix;
}

describe("the sample bundle read as an export", () => {
  let bundle: DentalBundle;

  beforeAll(() => {
    bundle = readBundle(sampleFiles());
  });

  it("loads every file it lists, leaving nothing behind", () => {
    expect(bundle.skipped).toEqual([]);
    expect(bundle.scans.map((scan) => scan.fileName)).toEqual([
      "sample-UpperJaw.stl",
      "sample-LowerJaw.stl",
      "sample-TotalJaw0.stl",
      "sample-TotalJaw1.stl",
    ]);
  });

  it("labels the scans the way the viewer shows them", () => {
    expect(bundle.scans.map((scan) => scan.label)).toEqual([
      "Upper Jaw",
      "Lower Jaw",
      "Total Jaw 0",
      "Total Jaw 1",
    ]);
  });

  it("recognises which part each scan is", () => {
    expect(bundle.scans.map((scan) => scan.kind)).toEqual([
      "upper",
      "lower",
      "total",
      "total",
    ]);
  });

  it("reads a triangle count that matches each file length exactly", () => {
    for (const scan of bundle.scans) {
      expect(scan.triangleCount).toBeGreaterThan(0);
      expect(scan.stl.byteLength).toBe(84 + (scan.triangleCount ?? 0) * 50);
    }
  });

  it("finds the case metadata and the transform", () => {
    expect(bundle.project?.patient.name).toBe("Sample Patient");
    expect(bundle.project?.practice.name).toBe("Sample Practice");
    expect(isIdentity(requireMatrix(bundle))).toBe(false);
  });

  it("reads the transform as a rigid placement, with its translation in the last row", () => {
    const matrix = requireMatrix(bundle);

    expect(translationOf(matrix).some((value) => value !== 0)).toBe(true);
    expect(matrix[3]).toBe(0);
  });
});
