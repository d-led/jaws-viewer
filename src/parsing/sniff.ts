/** How a file inside a dropped bundle is encoded. */
export type BundleFileKind =
  "zip" | "binary-stl" | "ascii-stl" | "xml" | "unknown";

const ZIP_MARKERS = [
  [0x50, 0x4b, 0x03, 0x04], // local file header
  [0x50, 0x4b, 0x05, 0x06], // end of central directory (empty archive)
  [0x50, 0x4b, 0x07, 0x08], // spanned archive
] as const;

const STL_TRIANGLE_COUNT_OFFSET = 80;
const STL_HEADER_BYTES = 84;
const BYTES_PER_STL_TRIANGLE = 50;
const PREFIX_BYTES = 512;

/**
 * Identifies a file by its content rather than its extension.
 *
 * Export bundles are not consistent about extensions — an `.stl` may be ASCII or
 * binary, and a `.dentalProject` is usually an XML descriptor but can be a vendor
 * archive — so the bytes are the only reliable signal.
 */
export function sniffBundleFile(bytes: Uint8Array): BundleFileKind {
  if (hasZipMarker(bytes)) return "zip";
  if (isBinaryStl(bytes)) return "binary-stl";

  const prefix = decodePrefix(bytes);
  if (prefix.trimStart().startsWith("<")) return "xml";
  if (/^\s*solid\b/i.test(prefix)) return "ascii-stl";
  return "unknown";
}

function hasZipMarker(bytes: Uint8Array): boolean {
  return ZIP_MARKERS.some((marker) =>
    marker.every((byte, offset) => bytes[offset] === byte),
  );
}

/**
 * A binary STL is exactly `84 + 50n` bytes, where `n` is the triangle count stored at
 * offset 80. Checking that arithmetic, rather than the leading `solid` keyword, is what
 * separates binary from ASCII: a binary header may well start with the word "solid".
 */
function isBinaryStl(bytes: Uint8Array): boolean {
  if (bytes.byteLength < STL_HEADER_BYTES) return false;
  const triangles = readUint32Le(bytes, STL_TRIANGLE_COUNT_OFFSET);
  return (
    STL_HEADER_BYTES + triangles * BYTES_PER_STL_TRIANGLE === bytes.byteLength
  );
}

export function readUint32Le(bytes: Uint8Array, offset: number): number {
  return new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getUint32(offset, true);
}

function decodePrefix(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes.subarray(0, PREFIX_BYTES));
}
