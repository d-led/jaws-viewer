import { unzipSync } from "fflate";
import type { BundleFile } from "./bundle-file";

export class UnreadableArchiveError extends Error {
  override readonly name = "UnreadableArchiveError";
}

/**
 * Expands a zip archive into its files.
 *
 * @throws {UnreadableArchiveError} when the archive is truncated or uses a compression
 * method that cannot be read.
 */
export function readZipEntries(bytes: Uint8Array): readonly BundleFile[] {
  try {
    return Object.entries(unzipSync(bytes))
      .filter(([path]) => !path.endsWith("/"))
      .map(([path, content]) => ({ path, bytes: content }));
  } catch (cause) {
    throw new UnreadableArchiveError(
      `The archive could not be read: ${describe(cause)}`,
    );
  }
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : "unknown error";
}
