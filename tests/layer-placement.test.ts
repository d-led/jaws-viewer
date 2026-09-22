import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { Matrix4Entries } from "../src/domain/matrix4";
import { layerPlacement } from "../src/viewer/layer-placement";

/** Doubles Z, written the way an export writes a matrix: translation in the last row. */
const DOUBLE_Z: Matrix4Entries = [
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1,
];

function place(
  placement: Matrix4Entries | null,
  lift: number,
  point: readonly [number, number, number],
): Vector3 {
  return new Vector3(...point).applyMatrix4(layerPlacement(placement, lift));
}

describe("placing a layer", () => {
  it("leaves a layer with no placement and no lift alone", () => {
    expect(place(null, 0, [1, 2, 3]).toArray()).toEqual([1, 2, 3]);
  });

  it("lifts a layer along the occlusal axis", () => {
    expect(place(null, 5, [1, 2, 3]).toArray()).toEqual([1, 2, 8]);
  });

  it("lifts by the amount asked for, in either direction", () => {
    expect(place(null, -4, [0, 0, 3]).z).toBeCloseTo(-1);
  });

  it("uses the export placement before the lift, not after", () => {
    // Doubling Z and then lifting by 5 puts a point at z=1 at 7. The other order gives 12.
    expect(place(DOUBLE_Z, 5, [0, 0, 1]).z).toBeCloseTo(7);
  });

  it("leaves the axes the export placement does not touch to the lift alone", () => {
    expect(place(DOUBLE_Z, 5, [4, 6, 1]).toArray()).toEqual([4, 6, 7]);
  });
});
