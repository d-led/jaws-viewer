/** An axis-aligned box in scan space, in millimetres. */
export interface Bounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface LayerBounds {
  readonly id: string;
  readonly bounds: Bounds;
}

/**
 * Scan space is Z-up, so the occlusal axis — the one a bite opens along — is Z.
 *
 * Only this axis is read: where a layer sits across the arch is irrelevant to opening a bite,
 * and two layers at the same height stay together whatever side they are on.
 */
const OCCLUSAL_AXIS = 2;

/**
 * How far each layer travels along the occlusal axis when fully separated.
 *
 * Each layer moves in proportion to how high its centre sits, so the order of the layers is
 * preserved and none can overtake another. At full separation the assembly spans twice its
 * scanned height, which opens a bite far enough to inspect the occlusal surfaces while
 * keeping the relationship between the parts readable.
 *
 * Positions are taken from the geometry rather than from the layer's kind, because an export's
 * parts do not always sort into an upper and a lower jaw: a closed-bite scan spans both.
 */
export function separationOffsets(
  layers: readonly LayerBounds[],
): ReadonlyMap<string, number> {
  const offsets = new Map<string, number>();
  const heights = layers.map((layer) => centreHeight(layer.bounds));
  const lowest = Math.min(...heights);
  const highest = Math.max(...heights);
  const halfSpread = (highest - lowest) / 2;

  // A lone layer, or several stacked at one height, has nothing to be separated from.
  if (!(halfSpread > 0)) {
    for (const layer of layers) offsets.set(layer.id, 0);
    return offsets;
  }

  const lowestEdge = Math.min(
    ...layers.map((layer) => layer.bounds.min[OCCLUSAL_AXIS]),
  );
  const highestEdge = Math.max(
    ...layers.map((layer) => layer.bounds.max[OCCLUSAL_AXIS]),
  );
  const reach = (highestEdge - lowestEdge) / 2;
  const middle = (highest + lowest) / 2;

  for (const layer of layers) {
    const height = centreHeight(layer.bounds) - middle;
    offsets.set(layer.id, (height / halfSpread) * reach);
  }
  return offsets;
}

function centreHeight(bounds: Bounds): number {
  return (bounds.min[OCCLUSAL_AXIS] + bounds.max[OCCLUSAL_AXIS]) / 2;
}
