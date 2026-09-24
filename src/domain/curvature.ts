import { assertNever } from "../support/errors";

/**
 * Curvature read off a scanned surface, at every vertex.
 *
 * A scanner's STL has one copy of each vertex per triangle, so the first job is welding the
 * corners that share a position back into a surface: nothing about a surface can be estimated
 * across triangles that touch only at identical coordinates.
 *
 * On top of that, the second fundamental form is fitted at every vertex from the way its
 * neighbours' normals turn away from its own, and the result is blurred over the one-ring. The
 * blur is not cosmetic: a scan is noisy, and triangle-to-triangle jitter reads as curvature that
 * is not there, so an unblurred estimate pictures the scanner rather than the anatomy.
 *
 * Signs: a surface bulging along its outward normal — a cusp tip — is positive; a groove — a
 * fissure, a margin — is negative. Magnitudes are in 1/mm.
 */

/** Weld tolerance, as a fraction of the model's diagonal. */
export const WELD_FRACTION = 1e-5;

/** The ends of a triangle's three edges, so each is walked in both directions. */
const EDGE_ENDS = [
  [0, 1],
  [1, 2],
  [2, 0],
] as const;

export interface WeldedMesh {
  /** One entry per distinct corner position. */
  readonly positions: Float32Array;
  /**
   * Three per triangle, into `positions`.
   *
   * A scanned STL lists its corners in triangle order, so this is also the corner-to-vertex map:
   * `indices[corner]` is the vertex that corner became, which is how a per-vertex value finds its
   * way back onto the corners of the soup.
   */
  readonly indices: Uint32Array;
  /** One unit outward normal per vertex. */
  readonly normals: Float32Array;
  /** The one-ring as compressed adjacency: `neighbours[offsets[v] .. offsets[v + 1])`. */
  readonly offsets: Uint32Array;
  readonly neighbours: Uint32Array;
}

export interface PrincipalCurvature {
  /** The algebraically larger principal curvature. */
  readonly k1: Float32Array;
  readonly k2: Float32Array;
}

/** The scalars a layer's surface can be coloured by. */
export type CurvatureKind =
  "k1" | "k2" | "mean" | "gaussian" | "curvedness" | "sharpness";

/** Every scalar, in the order a selector should offer them. */
export const CURVATURE_KINDS: readonly CurvatureKind[] = [
  "k1",
  "k2",
  "mean",
  "gaussian",
  "curvedness",
  "sharpness",
];

export interface Range {
  readonly min: number;
  readonly max: number;
}

/**
 * Welds the corners of a triangle soup into shared vertices and works out what is joined to what.
 *
 * `tolerance` is the step positions are rounded to: corners that round to the same multiple of it
 * become one vertex. Floating point noise means two copies of a corner rarely arrive identical,
 * and rounding is what recognises them — though a pair straddling a step need not, so welding a
 * scan is a heuristic about that noise rather than a geometric predicate.
 */
export function weld(positions: Float32Array, tolerance: number): WeldedMesh {
  const cornerCount = Math.floor(positions.length / 3);
  const quantise = quantiser(tolerance);

  const coordinates: number[] = [];
  const indices = new Uint32Array(cornerCount);
  const vertexAt = new Map<string, number>();

  for (let corner = 0; corner < cornerCount; corner += 1) {
    const x = positions[corner * 3]!;
    const y = positions[corner * 3 + 1]!;
    const z = positions[corner * 3 + 2]!;
    const key = `${quantise(x)},${quantise(y)},${quantise(z)}`;

    let vertex = vertexAt.get(key);
    if (vertex === undefined) {
      vertex = coordinates.length / 3;
      coordinates.push(x, y, z);
      vertexAt.set(key, vertex);
    }
    indices[corner] = vertex;
  }

  const welded = Float32Array.from(coordinates);

  return {
    positions: welded,
    indices,
    normals: vertexNormals(welded, indices),
    ...oneRing(indices, welded.length / 3),
  };
}

/**
 * Fits the second fundamental form at every vertex and reads the principal curvatures off it as
 * its eigenvalues.
 */
export function principalCurvatures(mesh: WeldedMesh): PrincipalCurvature {
  const k1 = new Float32Array(mesh.normals.length / 3);
  const k2 = new Float32Array(k1.length);

  for (let vertex = 0; vertex < k1.length; vertex += 1) {
    const operator = shapeOperatorAt(mesh, vertex);
    if (operator === null) continue;

    const [a, b, c] = operator;
    const middle = (a + c) / 2;
    const spread = Math.hypot((a - c) / 2, b);
    k1[vertex] = middle + spread;
    k2[vertex] = middle - spread;
  }
  return { k1, k2 };
}

/**
 * Blurs a per-vertex value over the one-ring, `iterations` times.
 *
 * Two passes at half weight spread an estimate over roughly a two-ring, which is enough to stop
 * triangle-to-triangle jitter dominating a picture while leaving a fissure a fissure. A vertex
 * nothing is joined to has no neighbours to average with and keeps what it had.
 */
export function smoothed(
  values: Float32Array,
  mesh: WeldedMesh,
  iterations = 2,
  weight = 0.5,
): Float32Array {
  let current = values;

  for (let round = 0; round < iterations; round += 1) {
    const next = Float32Array.from(current);

    for (let vertex = 0; vertex < next.length; vertex += 1) {
      const start = mesh.offsets[vertex]!;
      const end = mesh.offsets[vertex + 1]!;
      if (end === start) continue;

      let sum = 0;
      for (let i = start; i < end; i += 1) sum += current[mesh.neighbours[i]!]!;

      next[vertex] =
        current[vertex]! + weight * (sum / (end - start) - current[vertex]!);
    }
    current = next;
  }
  return current;
}

/** The scalar a layer's surface is painted with. */
export function curvatureField(
  curvature: PrincipalCurvature,
  kind: CurvatureKind,
): Float32Array {
  const { k1, k2 } = curvature;
  const field = new Float32Array(k1.length);

  for (let vertex = 0; vertex < field.length; vertex += 1) {
    field[vertex] = scalarOf(k1[vertex]!, k2[vertex]!, kind);
  }
  return field;
}

/** Whether a scalar has a zero worth showing: a groove is negative, a ridge positive. */
export function curvatureKindIsSigned(kind: CurvatureKind): boolean {
  switch (kind) {
    case "k1":
    case "k2":
    case "mean":
    case "gaussian":
      return true;
    case "curvedness":
    case "sharpness":
      return false;
    default:
      return assertNever(kind);
  }
}

/**
 * The range worth showing: the values between the given quantiles.
 *
 * A scan has a handful of readings that are artefacts rather than anatomy, and letting them set
 * the scale would flatten the rest into the middle of the ramp.
 */
export function robustRange(values: Float32Array, tailFraction = 0.02): Range {
  if (values.length === 0) return { min: 0, max: 0 };

  const sorted = values.toSorted();
  const tail = Math.floor(sorted.length * tailFraction);
  const low = sorted[Math.min(tail, sorted.length - 1)]!;
  const high = sorted[Math.max(sorted.length - 1 - tail, 0)]!;

  return { min: low, max: high };
}

/**
 * A range centred on zero, for a field where zero means flat.
 *
 * Ranging a signed field by its own extremes would slide the flat part of a jaw off the middle of
 * the ramp as soon as one side of the surface dominated the scan.
 */
export function symmetricRange(
  values: Float32Array,
  tailFraction = 0.02,
): Range {
  const { min, max } = robustRange(values, tailFraction);
  // A field with no spread has nothing to centre on either, and no range is drawn as flat rather
  // than stretched over whatever happens to be the middle of its values.
  if (max <= min) return { min: 0, max: 0 };

  const reach = Math.max(Math.abs(min), Math.abs(max));
  return { min: -reach, max: reach };
}

/**
 * How far the ramp is spread away from a linear reading of the values.
 *
 * Most of a jaw is nearly flat and a few places are not — margins, fissures, cusp edges — so a
 * linear transfer spends nearly all of its colours on a handful of places and leaves the rest of
 * the surface looking uniformly pale. A square root gives the quiet part of a surface something to
 * say, and stays monotone, so the same curvature still gets the same colour on every scan.
 */
export const RAMP_SPREAD = 0.5;

/**
 * Puts a field on the ramp: −1 for a groove, 0 for flat and +1 for a cusp, or 0 to 1 for a
 * magnitude, ready to be handed to a colour ramp.
 *
 * A signed field is expected to be ranged about zero, which is what `symmetricRange` gives it.
 * Spreading here rather than in the values themselves keeps one number per vertex meaning one
 * thing for everything that reads it.
 */
export function onRamp(
  values: Float32Array,
  range: Range,
  signed: boolean,
  spread = RAMP_SPREAD,
): Float32Array {
  const scale = range.max - range.min;
  const ramp = new Float32Array(values.length);

  for (let vertex = 0; vertex < values.length; vertex += 1) {
    // A field with no range to show is drawn flat: there is nothing there to exaggerate, and the
    // middle of the ramp is the least misleading place to say so.
    if (!(scale > 0)) continue;

    const within = Math.min(
      Math.max((values[vertex]! - range.min) / scale, 0),
      1,
    );
    // Halfway across a symmetric range is zero, and how far from halfway is how much curvature.
    const fromFlat = within - 0.5;
    ramp[vertex] = signed
      ? Math.sign(fromFlat) * Math.abs(fromFlat * 2) ** spread
      : within ** spread;
  }
  return ramp;
}

function scalarOf(k1: number, k2: number, kind: CurvatureKind): number {
  switch (kind) {
    case "k1":
      return k1;
    case "k2":
      return k2;
    case "mean":
      return (k1 + k2) / 2;
    case "gaussian":
      return k1 * k2;
    case "curvedness":
      return Math.sqrt((k1 * k1 + k2 * k2) / 2);
    // How much of the curvature is a crease rather than a dome: a ridge is curved one way and
    // flat the other, while a dome is curved equally both ways.
    case "sharpness":
      return Math.abs(k1 - k2);
    default:
      return assertNever(kind);
  }
}

function quantiser(tolerance: number): (value: number) => number {
  if (!(tolerance > 0)) return (value) => value;
  return (value) => Math.round(value / tolerance);
}

/** Area-weighted: a large triangle should say more about a vertex than a sliver does. */
function vertexNormals(
  positions: Float32Array,
  indices: Uint32Array,
): Float32Array {
  const normals = new Float32Array(positions.length);

  for (let face = 0; face < indices.length; face += 3) {
    const a = indices[face]!;
    const b = indices[face + 1]!;
    const c = indices[face + 2]!;
    const [x, y, z] = faceNormal(positions, a, b, c);

    for (const vertex of [a, b, c]) {
      const at = vertex * 3;
      normals[at]! += x;
      normals[at + 1]! += y;
      normals[at + 2]! += z;
    }
  }

  for (let vertex = 0; vertex < normals.length; vertex += 3) {
    const length = Math.hypot(
      normals[vertex]!,
      normals[vertex + 1]!,
      normals[vertex + 2]!,
    );
    if (length === 0) continue;

    normals[vertex]! /= length;
    normals[vertex + 1]! /= length;
    normals[vertex + 2]! /= length;
  }
  return normals;
}

/**
 * The fit at one vertex: the symmetric 2×2 that best explains how the neighbouring normals turn
 * as they step away in the tangent plane.
 *
 * Written in a tangent basis that is three unknowns — a, b and c — with one equation per
 * neighbour for each of the two tangent directions, which is a 3×3 least squares problem.
 */
function shapeOperatorAt(
  mesh: WeldedMesh,
  vertex: number,
): readonly [number, number, number] | null {
  const { positions, normals, offsets, neighbours } = mesh;
  const start = offsets[vertex]!;
  const end = offsets[vertex + 1]!;
  // Fewer than three neighbours cannot pin a surface down.
  if (end - start < 3) return null;

  const at = vertex * 3;
  const x = positions[at]!;
  const y = positions[at + 1]!;
  const z = positions[at + 2]!;
  const nx = normals[at]!;
  const ny = normals[at + 1]!;
  const nz = normals[at + 2]!;

  const [tx, ty, tz] = tangentOf(nx, ny, nz);
  const sx = ny * tz - nz * ty;
  const sy = nz * tx - nx * tz;
  const sz = nx * ty - ny * tx;

  let alongAlong = 0;
  let alongAcross = 0;
  let acrossAcross = 0;
  let alongTurn = 0;
  let acrossTurn = 0;
  let alongLean = 0;
  let acrossLean = 0;

  for (let i = start; i < end; i += 1) {
    const neighbour = neighbours[i]! * 3;
    const dx = positions[neighbour]! - x;
    const dy = positions[neighbour + 1]! - y;
    const dz = positions[neighbour + 2]! - z;

    const along = dx * tx + dy * ty + dz * tz;
    const across = dx * sx + dy * sy + dz * sz;

    const turnX = normals[neighbour]! - nx;
    const turnY = normals[neighbour + 1]! - ny;
    const turnZ = normals[neighbour + 2]! - nz;
    const turn = turnX * tx + turnY * ty + turnZ * tz;
    const lean = turnX * sx + turnY * sy + turnZ * sz;

    alongAlong += along * along;
    alongAcross += along * across;
    acrossAcross += across * across;
    alongTurn += along * turn;
    acrossTurn += across * turn;
    alongLean += along * lean;
    acrossLean += across * lean;
  }

  return solveSymmetric3(
    [
      alongAlong,
      alongAcross,
      0,
      acrossAcross + alongAlong,
      alongAcross,
      acrossAcross,
    ],
    [alongTurn, acrossTurn + alongLean, acrossLean],
  );
}

/** Any unit tangent: the axis the normal leans on least, crossed with it. */
function tangentOf(
  nx: number,
  ny: number,
  nz: number,
): readonly [number, number, number] {
  const shortest =
    Math.abs(nx) <= Math.abs(ny) && Math.abs(nx) <= Math.abs(nz)
      ? ([1, 0, 0] as const)
      : Math.abs(ny) <= Math.abs(nz)
        ? ([0, 1, 0] as const)
        : ([0, 0, 1] as const);

  const [ax, ay, az] = shortest;
  const crossX = ny * az - nz * ay;
  const crossY = nz * ax - nx * az;
  const crossZ = nx * ay - ny * ax;
  const length = Math.hypot(crossX, crossY, crossZ);
  if (length === 0) return [1, 0, 0];

  return [crossX / length, crossY / length, crossZ / length];
}

/**
 * Solves the fit's three normal equations by Gaussian elimination with partial pivoting, or gives
 * nothing back when the neighbourhood is too degenerate to say anything — three neighbours in a
 * line, say.
 */
function solveSymmetric3(
  rows: readonly [number, number, number, number, number, number],
  rhs: readonly [number, number, number],
): readonly [number, number, number] | null {
  const [r0, r1, r2, r3, r4, r5] = rows;
  // Row major 3×4: three unknowns and a right-hand column.
  const matrix = Float64Array.of(
    r0,
    r1,
    r2,
    rhs[0],
    r1,
    r3,
    r4,
    rhs[1],
    r2,
    r4,
    r5,
    rhs[2],
  );
  const scale = Math.max(
    Math.abs(r0),
    Math.abs(r1),
    Math.abs(r2),
    Math.abs(r3),
    Math.abs(r4),
    Math.abs(r5),
  );
  const negligible = scale * 1e-12;

  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (
        Math.abs(matrix[row * 4 + column]!) >
        Math.abs(matrix[pivot * 4 + column]!)
      ) {
        pivot = row;
      }
    }
    if (Math.abs(matrix[pivot * 4 + column]!) <= negligible) return null;
    swapRows(matrix, column, pivot);

    for (let row = column + 1; row < 3; row += 1) {
      const factor = matrix[row * 4 + column]! / matrix[column * 4 + column]!;
      for (let entry = column; entry < 4; entry += 1) {
        matrix[row * 4 + entry]! -= factor * matrix[column * 4 + entry]!;
      }
    }
  }

  const solution = [0, 0, 0];
  for (let row = 2; row >= 0; row -= 1) {
    let sum = matrix[row * 4 + 3]!;
    for (let column = row + 1; column < 3; column += 1) {
      sum -= matrix[row * 4 + column]! * solution[column]!;
    }
    solution[row] = sum / matrix[row * 4 + row]!;
  }
  return [solution[0]!, solution[1]!, solution[2]!];
}

function swapRows(matrix: Float64Array, a: number, b: number): void {
  for (let entry = 0; entry < 4; entry += 1) {
    const held = matrix[a * 4 + entry]!;
    matrix[a * 4 + entry] = matrix[b * 4 + entry]!;
    matrix[b * 4 + entry] = held;
  }
}

function faceNormal(
  positions: Float32Array,
  a: number,
  b: number,
  c: number,
): readonly [number, number, number] {
  const at = a * 3;
  const bt = b * 3;
  const ct = c * 3;
  const abx = positions[bt]! - positions[at]!;
  const aby = positions[bt + 1]! - positions[at + 1]!;
  const abz = positions[bt + 2]! - positions[at + 2]!;
  const acx = positions[ct]! - positions[at]!;
  const acy = positions[ct + 1]! - positions[at + 1]!;
  const acz = positions[ct + 2]! - positions[at + 2]!;

  return [aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx];
}

/** Compressed one-ring, with each neighbour listed once. */
function oneRing(
  indices: Uint32Array,
  vertexCount: number,
): { readonly offsets: Uint32Array; readonly neighbours: Uint32Array } {
  const degree = new Uint32Array(vertexCount);
  for (let face = 0; face < indices.length; face += 3) {
    for (const [from, to] of EDGE_ENDS) {
      degree[indices[face + from]!]! += 1;
      degree[indices[face + to]!]! += 1;
    }
  }

  const offsets = new Uint32Array(vertexCount + 1);
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    offsets[vertex + 1] = offsets[vertex]! + degree[vertex]!;
  }

  const cursor = offsets.slice(0, vertexCount);
  const listed = new Uint32Array(offsets[vertexCount]!);
  for (let face = 0; face < indices.length; face += 3) {
    for (const [from, to] of EDGE_ENDS) {
      const a = indices[face + from]!;
      const b = indices[face + to]!;
      listed[cursor[a]!] = b;
      cursor[a]! += 1;
      listed[cursor[b]!] = a;
      cursor[b]! += 1;
    }
  }

  // A vertex is listed once per triangle that touches it, and the fit wants each neighbour once.
  // The stamp is what each vertex's last visitor left behind, so a repeat is recognised without
  // sorting the list or building one set per vertex.
  const neighbours = new Uint32Array(listed.length);
  const starts = new Uint32Array(vertexCount + 1);
  const stamped = new Int32Array(vertexCount).fill(-1);
  let write = 0;

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    starts[vertex] = write;

    for (let i = offsets[vertex]!; i < offsets[vertex + 1]!; i += 1) {
      const neighbour = listed[i]!;
      if (stamped[neighbour] === vertex) continue;

      stamped[neighbour] = vertex;
      neighbours[write] = neighbour;
      write += 1;
    }
  }
  starts[vertexCount] = write;

  return { offsets: starts, neighbours: neighbours.slice(0, write) };
}
