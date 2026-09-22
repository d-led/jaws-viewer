import { describe, expect, it } from "vitest";
import { readBundle } from "../src/io/bundle-reader";
import type { BundleFile } from "../src/io/bundle-file";
import { parseDentalProject } from "../src/parsing/dental-project-parser";
import { parseXmlDocument } from "../src/parsing/xml";
import {
  asciiStl,
  binaryStl,
  matrix4Xml,
  textBytes,
  zipOf,
  PROJECT_XML,
} from "./fixtures";

function loose(path: string, bytes: Uint8Array | string): BundleFile {
  return { path, bytes: typeof bytes === "string" ? textBytes(bytes) : bytes };
}

function zip(
  path: string,
  entries: Readonly<Record<string, Uint8Array | string>>,
): BundleFile {
  return { path, bytes: zipOf(entries) };
}

const MATRIX_ENTRIES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

describe("reading a dropped bundle", () => {
  it("collects the metadata, the transform and every scan", () => {
    const bundle = readBundle([
      loose("Case.dentalProject", PROJECT_XML),
      loose("Case.matrix4", matrix4Xml(MATRIX_ENTRIES)),
      loose("Case-UpperJaw.stl", binaryStl(3)),
      loose("Case-LowerJaw.stl", binaryStl(5)),
    ]);

    expect(bundle.project).not.toBeNull();
    expect(bundle.matrix).toEqual(MATRIX_ENTRIES);
    expect(bundle.scans.map((scan) => scan.kind)).toEqual(["upper", "lower"]);
    expect(bundle.scans.map((scan) => scan.triangleCount)).toEqual([3, 5]);
    expect(bundle.skipped).toEqual([]);
  });

  it("reads the same bundle straight out of a zip", () => {
    const bundle = readBundle([
      zip("export.zip", {
        "export/Case.dentalProject": PROJECT_XML,
        "export/Case.matrix4": matrix4Xml(MATRIX_ENTRIES),
        "export/Case-UpperJaw.stl": binaryStl(3),
      }),
    ]);

    expect(bundle.project?.patient.name).toBe("Test Patient");
    expect(bundle.scans).toHaveLength(1);
    expect(bundle.scans[0]?.label).toBe("Upper Jaw");
  });

  it("opens an archive inside an archive", () => {
    const inner = zipOf({ "Case-UpperJaw.stl": binaryStl(2) });
    const bundle = readBundle([zip("outer.zip", { "inner.zip": inner })]);

    expect(bundle.scans).toHaveLength(1);
  });

  it("opens a .dentalProject that is really a vendor archive", () => {
    const bundle = readBundle([
      zip("Case.dentalProject", {
        "Case-TotalJaw0.stl": binaryStl(7),
        "project.xml": PROJECT_XML,
      }),
    ]);

    expect(bundle.project).not.toBeNull();
    expect(bundle.scans[0]?.kind).toBe("total");
  });

  it("goes by content rather than by file extension", () => {
    const bundle = readBundle([
      loose("scan.bin", binaryStl(4)),
      loose("metadata.txt", PROJECT_XML),
      loose("transform.dat", matrix4Xml(MATRIX_ENTRIES)),
    ]);

    expect(bundle.scans).toHaveLength(1);
    expect(bundle.project).not.toBeNull();
    expect(bundle.matrix).not.toBeNull();
  });

  it("reads a text STL too", () => {
    expect(
      readBundle([loose("UpperJaw.stl", asciiStl(4))]).scans[0]?.triangleCount,
    ).toBe(4);
  });

  it("keeps two scans of the same name in different folders apart", () => {
    const bundle = readBundle([
      loose("patient-a/UpperJaw.stl", binaryStl(1)),
      loose("patient-b/UpperJaw.stl", binaryStl(2)),
    ]);

    expect(bundle.scans).toHaveLength(2);
    expect(new Set(bundle.scans.map((scan) => scan.id)).size).toBe(2);
  });

  it("reports files it cannot use instead of failing the whole load", () => {
    const bundle = readBundle([
      loose("Case-UpperJaw.stl", binaryStl(3)),
      loose("readme.md", "# notes"),
      zip("broken.zip", {}),
    ]);

    expect(bundle.scans).toHaveLength(1);
    expect(bundle.skipped).toEqual(["readme.md (unrecognised file type)"]);
  });

  it("reports a metadata file it cannot read", () => {
    const bundle = readBundle([
      loose("Case.dentalProject", "<Treatment><TrayNo>1"),
    ]);

    expect(bundle.project).toBeNull();
    expect(bundle.skipped[0]).toMatch(/^Case\.dentalProject \(/);
  });

  it("gives each scan bytes of its own, because zip entries share one buffer", () => {
    const bundle = readBundle([
      zip("export.zip", {
        "Case-UpperJaw.stl": binaryStl(3),
        "Case-LowerJaw.stl": binaryStl(5),
      }),
    ]);

    const [upper, lower] = bundle.scans;
    expect(upper?.stl).not.toBe(lower?.stl);
    expect(upper?.stl.byteLength).toBe(84 + 3 * 50);
    expect(lower?.stl.byteLength).toBe(84 + 5 * 50);
  });

  it("produces the same project the parser would have produced on its own", () => {
    const fromBundle = readBundle([
      loose("Case.dentalProject", PROJECT_XML),
    ]).project;
    const direct = parseDentalProject(parseXmlDocument(PROJECT_XML));

    expect(fromBundle).toEqual(direct);
  });
});
