/**
 * One file handed to the reader, either picked from disk or extracted from an archive.
 */
export interface BundleFile {
  /**
   * Where the file came from. Unique within a drop, and used as the layer identity, so
   * that two scans with the same name in different folders stay distinct.
   */
  readonly path: string;
  readonly bytes: Uint8Array;
}

/** The last path segment — what the user recognises the file by. */
export function baseName(path: string): string {
  const separator = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return separator === -1 ? path : path.slice(separator + 1);
}
