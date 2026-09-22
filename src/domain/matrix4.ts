/**
 * A 4x4 matrix exactly as written in an `.matrix4` file, in row-major order:
 *
 *     _00 _01 _02 _03
 *     _10 _11 _12 _13
 *     _20 _21 _22 _23
 *     _30 _31 _32 _33
 *
 * Exports place the translation in the **last row** (`_30`, `_31`, `_32`) and leave
 * the last column as `0 0 0 1`. That is the row-vector convention, where a point is
 * transformed as `p' = p x M`.
 *
 * three.js uses the column-vector convention (`p' = M x p`, translation in the last
 * column), so entries must be converted with {@link toColumnVectorEntries} before
 * being handed to a three.js `Matrix4`.
 */
// prettier-ignore
export type Matrix4Entries = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

export function identityEntries(): Matrix4Entries {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/**
 * Re-expresses a row-vector matrix as a column-vector matrix, which for a 4x4
 * matrix is exactly its transpose.
 *
 *     ┌ _00 _01 _02 _03 ┐          ┌ _00 _10 _20 _30 ┐
 *     │ _10 _11 _12 _13 │   ──▶    │ _01 _11 _21 _31 │
 *     │ _20 _21 _22 _23 │          │ _02 _12 _22 _32 │
 *     └ _30 _31 _32 _33 ┘          └ _03 _13 _23 _33 ┘
 */
export function toColumnVectorEntries(entries: Matrix4Entries): Matrix4Entries {
  // prettier-ignore
  const [
    m00, m01, m02, m03,
    m10, m11, m12, m13,
    m20, m21, m22, m23,
    m30, m31, m32, m33,
  ] = entries;
  // prettier-ignore
  return [
    m00, m10, m20, m30,
    m01, m11, m21, m31,
    m02, m12, m22, m32,
    m03, m13, m23, m33,
  ];
}

/** The translation component, read from the last row of the file's matrix. */
export function translationOf(
  entries: Matrix4Entries,
): [number, number, number] {
  const [, , , , , , , , , , , , m30, m31, m32] = entries;
  return [m30, m31, m32];
}

export function isIdentity(entries: Matrix4Entries): boolean {
  return entries.every((value, index) => value === identityEntries()[index]);
}
