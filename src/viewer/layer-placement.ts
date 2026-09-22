import { Matrix4 } from "three";
import { toColumnVectorEntries, type Matrix4Entries } from "../domain/matrix4";

/**
 * The matrix a layer is drawn with.
 *
 * Two things move a layer, and they compose in this order:
 *
 * 1. the export's own `.matrix4` placement, which is part of the data;
 * 2. the separation `lift`, applied afterwards, in scan space, because it is a way of looking
 *    at the assembly rather than a property of it.
 *
 * The order is observable — it is `translate × placement`, not `placement × translate` — so a
 * placement that scales or rotates would move the layer differently if the two were swapped.
 */
export function layerPlacement(
  placement: Matrix4Entries | null,
  lift: number,
): Matrix4 {
  const matrix = new Matrix4().makeTranslation(0, 0, lift);
  if (placement === null) return matrix;

  return matrix.multiply(
    new Matrix4().set(...toColumnVectorEntries(placement)),
  );
}
