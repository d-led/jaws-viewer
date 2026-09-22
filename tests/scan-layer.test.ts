import { describe, expect, it } from "vitest";
import { classifyScan, labelForScan } from "../src/domain/scan-layer";

describe("naming a scan", () => {
  it("drops the case qualifier and reads the part off the end of the file name", () => {
    expect(labelForScan("123_123_Example Practice-UpperJaw.stl")).toBe(
      "Upper Jaw",
    );
  });

  it("separates a trailing number", () => {
    expect(labelForScan("123_123_Example Practice-TotalJaw0.stl")).toBe(
      "Total Jaw 0",
    );
  });

  it("falls back to the file name when there is no qualifier to strip", () => {
    expect(labelForScan("UpperJaw.stl")).toBe("Upper Jaw");
  });
});

describe("recognising which part a scan is", () => {
  it("reads the anatomical name out of the file name", () => {
    expect(classifyScan("Case-UpperJaw.stl")).toBe("upper");
    expect(classifyScan("Case-LowerJaw.stl")).toBe("lower");
    expect(classifyScan("Case-TotalJaw0.stl")).toBe("total");
    expect(classifyScan("Case-gingiva.stl")).toBe("other");
  });

  it("uses the clinical terms as well", () => {
    expect(classifyScan("maxilla.stl")).toBe("upper");
    expect(classifyScan("mandible.stl")).toBe("lower");
  });
});
