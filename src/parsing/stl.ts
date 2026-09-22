import { readUint32Le, type BundleFileKind } from "./sniff";

const STL_TRIANGLE_COUNT_OFFSET = 80;
const FACET_PATTERN = /^\s*facet\b/gim;

/**
 * Triangle count straight from the file, so the UI can report model size before any
 * geometry reaches the GPU.
 */
export function readStlTriangleCount(
  bytes: Uint8Array,
  kind: BundleFileKind,
): number | null {
  if (kind === "binary-stl")
    return readUint32Le(bytes, STL_TRIANGLE_COUNT_OFFSET);
  if (kind === "ascii-stl")
    return countAsciiFacets(new TextDecoder().decode(bytes));
  return null;
}

function countAsciiFacets(text: string): number {
  return text.match(FACET_PATTERN)?.length ?? 0;
}
