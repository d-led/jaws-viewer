import { describe, expect, it } from "vitest";
import {
  identityEntries,
  isIdentity,
  toColumnVectorEntries,
  translationOf,
} from "../src/domain/matrix4";

const ONE_TO_SIXTEEN = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
] as const;

/** `_30` and `_31` hold the translation, so a rigid transform has 0 0 0 1 in the last column. */
function rigid(translateX: number, translateY: number, translateZ: number) {
  // prettier-ignore
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    translateX, translateY, translateZ, 1,
  ] as const;
}

describe("matrix4 entries", () => {
  it("turns a row-vector matrix into the column-vector form three.js expects", () => {
    expect(toColumnVectorEntries(ONE_TO_SIXTEEN)).toEqual([
      1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15, 4, 8, 12, 16,
    ]);
  });

  it("leaves an identity matrix alone when the conventions are swapped", () => {
    expect(toColumnVectorEntries(identityEntries())).toEqual(identityEntries());
  });

  it("moves the translation from the last row into the last column", () => {
    const converted = toColumnVectorEntries(rigid(30, 0, -22.5));

    expect([converted[3], converted[7], converted[11]]).toEqual([30, 0, -22.5]);
    expect([converted[12], converted[13], converted[14]]).toEqual([0, 0, 0]);
  });

  it("reads the translation from the last row of the file", () => {
    expect(translationOf(rigid(30, 0, -22.5))).toEqual([30, 0, -22.5]);
  });

  it("recognises the identity matrix", () => {
    expect(isIdentity(identityEntries())).toBe(true);
    expect(isIdentity(rigid(1, 0, 0))).toBe(false);
  });
});
