import type { ViewSettings } from "../domain/view-settings";
import type { BundleFile } from "./bundle-file";

/**
 * Remembers the last session across reloads: the dropped files, and how they were being looked at.
 *
 * The two are kept separately because they change at completely different rates — the files are
 * written once per load and are tens of megabytes, while the view is written on every slider
 * movement and is a few hundred bytes.
 */
export interface SessionStore {
  saveFiles(files: readonly BundleFile[]): Promise<void>;
  readFiles(): Promise<readonly BundleFile[] | null>;
  saveView(view: ViewSettings): Promise<void>;
  readView(): Promise<ViewSettings | null>;
  forget(): Promise<void>;
}

/**
 * Copies each file's bytes into a buffer of exactly its own length.
 *
 * Zip entries arrive as views into one shared decompression buffer, so storing them as they
 * are would make every entry drag the whole archive along with it.
 */
export function compactFiles(
  files: readonly BundleFile[],
): readonly BundleFile[] {
  return files.map((file) => ({ path: file.path, bytes: file.bytes.slice() }));
}

/**
 * Checks that stored files are still something this version can read. A record written by an
 * older version is treated as nothing saved rather than handed on to the reader.
 */
export function isStoredFiles(value: unknown): value is readonly BundleFile[] {
  return Array.isArray(value) && value.every(isStoredFile);
}

function isStoredFile(value: unknown): value is BundleFile {
  if (typeof value !== "object" || value === null) return false;
  if (!("path" in value) || !("bytes" in value)) return false;

  return typeof value.path === "string" && value.bytes instanceof Uint8Array;
}
