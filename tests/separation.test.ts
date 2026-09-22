import { describe, expect, it } from "vitest";
import { separationOffsets, type LayerBounds } from "../src/domain/explode";

/** A layer spanning `zMin`..`zMax`, sitting `x` millimetres to the side. */
function layer(id: string, zMin: number, zMax: number, x = 0): LayerBounds {
  return { id, bounds: { min: [x - 5, -5, zMin], max: [x + 5, 5, zMax] } };
}

/** The travel of each layer, in the order the layers were given. */
function orderedOffsets(layers: readonly LayerBounds[]): number[] {
  const offsets = separationOffsets(layers);
  return layers.map((entry) => {
    const offset = offsets.get(entry.id);
    if (offset === undefined) throw new Error(`No offset for ${entry.id}.`);
    return offset;
  });
}

describe("separating an assembly along the occlusal axis", () => {
  it("has nothing to separate in a lone layer", () => {
    expect(separationOffsets([layer("only", 0, 10)])).toEqual(
      new Map([["only", 0]]),
    );
  });

  it("has nothing to separate in a bundle of empty layers", () => {
    expect(separationOffsets([])).toEqual(new Map());
  });

  it("leaves layers that are stacked at one height where they are", () => {
    expect(orderedOffsets([layer("a", 0, 10), layer("b", 0, 10)])).toEqual([
      0, 0,
    ]);
  });

  it("sends the higher layer up and the lower one down", () => {
    expect(
      separationOffsets([layer("upper", 0, 10), layer("lower", -10, 0)]),
    ).toEqual(
      new Map([
        ["upper", 10],
        ["lower", -10],
      ]),
    );
  });

  it("holds a layer that sits in the middle", () => {
    expect(
      orderedOffsets([
        layer("upper", 0, 10),
        layer("middle", -1, 1),
        layer("lower", -10, 0),
      ]),
    ).toEqual([10, 0, -10]);
  });

  it("reads height only, so where a layer sits across the arch does not move it", () => {
    const left = layer("left", 0, 10, -25);
    const right = layer("right", 0, 10, 25);

    expect(orderedOffsets([left, right])).toEqual([0, 0]);
  });

  it("never lets a layer overtake the one above it", () => {
    const ordered = orderedOffsets([
      layer("a", -30, -20),
      layer("b", -10, 0),
      layer("c", 5, 15),
      layer("d", 20, 40),
    ]);

    expect(ordered).toEqual(
      ordered.toSorted((first, second) => first - second),
    );
    expect(new Set(ordered).size).toBe(ordered.length);
  });

  it("spreads the assembly over twice its scanned height", () => {
    const layers = [layer("upper", 0, 20), layer("lower", -20, 0)];
    const [upper, lower] = orderedOffsets(layers);

    const scannedSpan = 40;
    const openedSpan = 20 + (upper ?? 0) - (-20 + (lower ?? 0));

    expect(openedSpan).toBe(scannedSpan * 2);
  });

  it("keeps the assembly centred, so nothing drifts sideways or away", () => {
    const ordered = orderedOffsets([
      layer("upper", 0, 20),
      layer("middle", -1, 1),
      layer("lower", -20, 0),
    ]);

    expect(ordered.reduce((sum, offset) => sum + offset, 0)).toBeCloseTo(0);
  });

  it("answers for every layer, so none is left behind", () => {
    const offsets = separationOffsets([layer("a", 0, 10), layer("b", -10, 0)]);

    expect([...offsets.keys()]).toEqual(["a", "b"]);
  });
});
