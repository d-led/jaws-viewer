import { describe, expect, it } from "vitest";
import { parseMatrix4 } from "../src/parsing/matrix4-parser";
import {
  MalformedXmlError,
  UnexpectedRootElementError,
  parseXmlDocument,
} from "../src/parsing/xml";
import { PROJECT_XML, matrix4Xml } from "./fixtures";

const ENTRIES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

function parse(xml: string) {
  return parseMatrix4(parseXmlDocument(xml));
}

describe("reading a .matrix4 export", () => {
  it("reads _00 to _33 in row-major file order", () => {
    expect(parse(matrix4Xml(ENTRIES))).toEqual(ENTRIES);
  });

  it("reads the translation the export writes in the last row", () => {
    const entries = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 30, 0, -22.5, 1];

    expect(parse(matrix4Xml(entries)).slice(12)).toEqual([30, 0, -22.5, 1]);
  });

  it("accepts negative and fractional values", () => {
    const entries = [-1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

    expect(parse(matrix4Xml(entries)).slice(0, 3)).toEqual([-1, 0, 0]);
  });

  it("refuses a matrix that is missing an entry", () => {
    const incomplete = matrix4Xml(ENTRIES).replace(
      / {4}<_23>[\d.-]+<\/_23>\n/,
      "",
    );

    expect(() => parse(incomplete)).toThrow(/missing the <_23> entry/);
  });

  it("refuses an entry that is not a number", () => {
    const broken = matrix4Xml(ENTRIES).replace(
      "<_11>6</_11>",
      "<_11>six</_11>",
    );

    expect(() => parse(broken)).toThrow(MalformedXmlError);
  });

  it("refuses a document that is not a matrix", () => {
    expect(() => parse(PROJECT_XML)).toThrow(UnexpectedRootElementError);
  });
});
