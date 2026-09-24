import { describe, expect, it } from "vitest";
import {
  CURVATURE_KINDS,
  curvatureField,
  curvatureKindIsSigned,
  onRamp,
  principalCurvatures,
  robustRange,
  smoothed,
  symmetricRange,
  weld,
  type WeldedMesh,
} from "../src/domain/curvature";

/** A tolerance well under any distance in these shapes. */
const WELDED = 1e-4;

/** A scan the way a scanner writes one: one copy of every corner, per triangle. */
function soup(
  corners: ReadonlyArray<readonly [number, number, number]>,
): Float32Array {
  const positions = new Float32Array(corners.length * 3);
  corners.forEach(([x, y, z], at) => {
    positions[at * 3] = x;
    positions[at * 3 + 1] = y;
    positions[at * 3 + 2] = z;
  });
  return positions;
}

/**
 * A grid over the square from -1 to 1, with `height` giving the z of each point.
 *
 * A regular grid rather than a fan of triangles, because the fit at a vertex wants the vertices
 * around it, and a grid is the shape whose curvature is easiest to state in advance.
 */
function surface(
  divisions: number,
  height: (x: number, y: number) => number,
): Float32Array {
  const corners: Array<readonly [number, number, number]> = [];
  const at = (i: number, j: number): readonly [number, number, number] => {
    const x = -1 + (2 * i) / divisions;
    const y = -1 + (2 * j) / divisions;
    return [x, y, height(x, y)];
  };

  for (let i = 0; i < divisions; i += 1) {
    for (let j = 0; j < divisions; j += 1) {
      corners.push(at(i, j), at(i + 1, j), at(i + 1, j + 1));
      corners.push(at(i, j), at(i + 1, j + 1), at(i, j + 1));
    }
  }
  return soup(corners);
}

/** A sphere with poles, wound so that its normals point outwards. */
function sphere(radius: number, segments: number, rings: number): Float32Array {
  const corners: Array<readonly [number, number, number]> = [];
  const at = (
    ring: number,
    segment: number,
  ): readonly [number, number, number] => {
    const fromPole = (ring / rings) * Math.PI;
    const around = (segment / segments) * 2 * Math.PI;
    return [
      radius * Math.sin(fromPole) * Math.cos(around),
      radius * Math.sin(fromPole) * Math.sin(around),
      radius * Math.cos(fromPole),
    ];
  };

  for (let ring = 0; ring < rings; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      corners.push(
        at(ring, segment),
        at(ring + 1, segment),
        at(ring + 1, segment + 1),
      );
      corners.push(
        at(ring, segment),
        at(ring + 1, segment + 1),
        at(ring, segment + 1),
      );
    }
  }
  return soup(corners);
}

/** A tube of the given radius and length along the z axis, its ends left open. */
function cylinder(
  radius: number,
  length: number,
  segments: number,
  rings: number,
): Float32Array {
  const corners: Array<readonly [number, number, number]> = [];
  const at = (
    ring: number,
    segment: number,
  ): readonly [number, number, number] => {
    const around = (segment / segments) * 2 * Math.PI;
    return [
      radius * Math.cos(around),
      radius * Math.sin(around),
      (ring / (rings - 1)) * length,
    ];
  };

  for (let ring = 0; ring < rings - 1; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      corners.push(
        at(ring, segment),
        at(ring, segment + 1),
        at(ring + 1, segment),
      );
      corners.push(
        at(ring, segment + 1),
        at(ring + 1, segment + 1),
        at(ring + 1, segment),
      );
    }
  }
  return soup(corners);
}

function vertices(mesh: WeldedMesh): number {
  return mesh.positions.length / 3;
}

/** The vertex closest to a point, which is what a test means when it says "the middle". */
function vertexNearest(
  mesh: WeldedMesh,
  [x, y, z]: readonly [number, number, number],
): number {
  let nearest = Infinity;
  let best = 0;

  for (let vertex = 0; vertex < vertices(mesh); vertex += 1) {
    const dx = mesh.positions[vertex * 3]! - x;
    const dy = mesh.positions[vertex * 3 + 1]! - y;
    const dz = mesh.positions[vertex * 3 + 2]! - z;
    const distance = dx * dx + dy * dy + dz * dz;

    if (distance < nearest) {
      nearest = distance;
      best = vertex;
    }
  }
  return best;
}

describe("welding a scanned triangle soup", () => {
  it("joins corners that were the same point", () => {
    const mesh = weld(
      soup([
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [1, 0, 0],
        [1, 1, 0],
        [0, 1, 0],
      ]),
      WELDED,
    );

    expect(vertices(mesh)).toBe(4);
  });

  it("tells corners further apart than the tolerance apart", () => {
    const mesh = weld(
      soup([
        [0, 0, 0],
        [1, 0, 0],
        [0, 0.5, 0],
      ]),
      WELDED,
    );

    expect(vertices(mesh)).toBe(3);
  });

  it("lists each neighbour once, whichever way round the triangles are wound", () => {
    const mesh = weld(
      soup([
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [1, 0, 0],
        [1, 1, 0],
        [0, 1, 0],
      ]),
      WELDED,
    );

    // Two triangles sharing a diagonal make five edges, read both ways.
    expect([...mesh.offsets]).toEqual([0, 2, 5, 8, 10]);
  });
});

describe("the curvature of a surface", () => {
  it("reads a flat surface as flat", () => {
    const { k1, k2 } = principalCurvatures(
      weld(
        surface(8, () => 0),
        WELDED,
      ),
    );

    expect(Math.max(...[...k1].map(Math.abs))).toBeLessThan(1e-9);
    expect(Math.max(...[...k2].map(Math.abs))).toBeLessThan(1e-9);
  });

  it("reads the same curvature in every direction on a sphere", () => {
    const radius = 2;
    const mesh = weld(sphere(radius, 64, 32), WELDED);
    const { k1, k2 } = principalCurvatures(mesh);

    for (let vertex = 0; vertex < k1.length; vertex += 1) {
      // A sphere written in rings and segments is at its most lopsided at the poles, where its
      // triangles stop being a fair sample of the surface. Everywhere else is where an estimate has
      // to hold up, and there it is right to about a part in three hundred.
      if (Math.abs(mesh.positions[vertex * 3 + 2]!) > radius * 0.8) continue;

      expect(k1[vertex]).toBeCloseTo(k2[vertex]!, 1);
      expect(k1[vertex]).toBeCloseTo(1 / radius, 2);
    }
  });

  it("curves a cylinder across its axis and not along it", () => {
    const mesh = weld(cylinder(3, 8, 32, 3), WELDED);
    const { k1, k2 } = principalCurvatures(mesh);
    const middle = vertexNearest(mesh, [3, 0, 4]);

    expect(k1[middle]).toBeCloseTo(1 / 3, 1);
    expect(Math.abs(k2[middle]!)).toBeLessThan(0.02);
  });

  it("calls the convex direction of a saddle convex and the other concave", () => {
    const mesh = weld(
      surface(64, (x, y) => x * x - y * y),
      WELDED,
    );
    const { k1, k2 } = principalCurvatures(mesh);
    const middle = vertexNearest(mesh, [0, 0, 0]);

    // z = x² - y² curves by 2 either way, one way up and the other way down.
    expect(k1[middle]).toBeCloseTo(2, 1);
    expect(k2[middle]).toBeCloseTo(-2, 1);
  });
});

describe("blurring a curvature estimate", () => {
  it("spreads a lone spike into the vertices around it", () => {
    const mesh = weld(
      surface(8, () => 0),
      WELDED,
    );
    const spike = new Float32Array(vertices(mesh));
    spike[0] = 1;

    const blurred = smoothed(spike, mesh, 1);

    expect(blurred[0]!).toBeLessThan(1);
    expect([...blurred].filter((value) => value > 0).length).toBeGreaterThan(1);
  });

  it("leaves a surface that is already even alone", () => {
    const mesh = weld(
      surface(8, () => 0),
      WELDED,
    );

    const blurred = smoothed(
      new Float32Array(vertices(mesh)).fill(0.5),
      mesh,
      2,
    );

    expect([...blurred].every((value) => value === 0.5)).toBe(true);
  });
});

describe("showing a curvature on a ramp", () => {
  it("lets a couple of spikes among hundreds of readings not set the scale", () => {
    const readings = Float32Array.from([
      ...Array.from({ length: 200 }, () => 0.4),
      5000,
      5000,
    ]);

    expect(robustRange(readings).max).toBeLessThan(1);
  });

  it("ranges a signed field around zero, so flat stays in the middle of the ramp", () => {
    const range = symmetricRange(Float32Array.from([-1, 0, 1, 3]));

    expect(range.min).toBe(-range.max);
    expect(range.max).toBeCloseTo(3, 5);
  });

  it("spreads the quiet part of a surface away from flat", () => {
    // Most of a jaw is nearly flat, so a tenth of the way to the end of the range has to read as
    // more than a tenth of the way along the ramp, or the whole surface looks pale.
    const [quiet] = onRamp(Float32Array.from([0.1]), { min: -1, max: 1 }, true);

    expect(quiet).toBeGreaterThan(0.25);
    expect(quiet).toBeLessThan(0.5);
  });

  it("still reaches both ends of the ramp at the ends of the range", () => {
    const ramp = onRamp(
      Float32Array.from([-1, 0, 1]),
      { min: -1, max: 1 },
      true,
    );

    expect([...ramp]).toEqual([-1, 0, 1]);
  });

  it("keeps the order of the values it spreads", () => {
    const ramp = onRamp(
      Float32Array.from([-0.9, -0.2, 0, 0.3, 0.8]),
      { min: -1, max: 1 },
      true,
    );

    expect([...ramp]).toEqual([...ramp].toSorted((a, b) => a - b));
  });

  it("keeps to the ramp for a value outside the range", () => {
    const ramp = onRamp(
      Float32Array.from([-10, 20]),
      { min: 0, max: 10 },
      false,
    );

    expect([...ramp]).toEqual([0, 1]);
  });

  it("shows a magnitude on the upper half of the ramp", () => {
    const [nothing, most] = onRamp(
      Float32Array.from([0, 0.9]),
      { min: 0, max: 1 },
      false,
    );

    expect(nothing).toBe(0);
    expect(most).toBeGreaterThan(0.9);
  });

  it("draws a surface with no range to show as flat rather than stretching it", () => {
    const flat = new Float32Array(10).fill(7);

    const ramp = onRamp(flat, symmetricRange(flat), true);

    expect([...ramp].every((value) => value === 0)).toBe(true);
  });

  it("knows which scalars have a zero worth showing", () => {
    expect(curvatureKindIsSigned("k1")).toBe(true);
    expect(curvatureKindIsSigned("mean")).toBe(true);
    expect(curvatureKindIsSigned("curvedness")).toBe(false);
    expect(curvatureKindIsSigned("sharpness")).toBe(false);
  });

  it("reads sharpness as how much the surface is a crease rather than a dome", () => {
    const field = curvatureField(
      { k1: Float32Array.from([3, 1, 2]), k2: Float32Array.from([1, -1, 2]) },
      "sharpness",
    );

    // A ridge is curved one way and flat the other; a dome is curved equally both ways, so it has
    // no sharpness at all.
    expect([...field]).toEqual([2, 2, 0]);
  });

  it("offers every scalar a layer can be painted by, each once", () => {
    expect(new Set(CURVATURE_KINDS).size).toBe(CURVATURE_KINDS.length);
    expect(CURVATURE_KINDS).toHaveLength(6);
  });
});
