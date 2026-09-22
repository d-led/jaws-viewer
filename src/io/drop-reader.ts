import type { BundleFile } from "./bundle-file";

/**
 * Collects files from a browser drop.
 *
 * A folder drop only exposes files through the non-standard FileSystem entry API, which is
 * why the directory tree is walked by hand; the `files` list is used as the fallback for
 * browsers (and drag sources) that only offer flat files.
 */
export async function readDroppedFiles(
  transfer: DataTransfer,
): Promise<readonly BundleFile[]> {
  const entries = Array.from(transfer.items).map(entryOf).filter(isEntry);

  if (entries.length === 0) return readFileList(transfer.files);
  const nested = await Promise.all(
    entries.map((entry) => readEntry(entry, "")),
  );
  return nested.flat();
}

/**
 * The entry API is the only way to walk a dropped folder, and it is not universally
 * available; where it is missing, `transfer.files` still carries the flat files.
 */
function entryOf(item: DataTransferItem): FileSystemEntry | null {
  return typeof item.webkitGetAsEntry === "function"
    ? item.webkitGetAsEntry()
    : null;
}

export async function readFileList(
  files: FileList | readonly File[],
): Promise<readonly BundleFile[]> {
  return Promise.all(
    Array.from(files).map(async (file) => ({
      path: pathOf(file),
      bytes: new Uint8Array(await file.arrayBuffer()),
    })),
  );
}

async function readEntry(
  entry: FileSystemEntry,
  parentPath: string,
): Promise<readonly BundleFile[]> {
  const path = parentPath === "" ? entry.name : `${parentPath}/${entry.name}`;

  if (isFileEntry(entry)) return [await readFileEntry(entry, path)];
  if (isDirectoryEntry(entry)) return readDirectory(entry, path);
  return [];
}

function readFileEntry(
  entry: FileSystemFileEntry,
  path: string,
): Promise<BundleFile> {
  return new Promise<File>((resolve, reject) =>
    entry.file(resolve, reject),
  ).then(async (file) => ({
    path,
    bytes: new Uint8Array(await file.arrayBuffer()),
  }));
}

async function readDirectory(
  entry: FileSystemDirectoryEntry,
  path: string,
): Promise<readonly BundleFile[]> {
  const children = await readAllEntries(entry.createReader());
  const nested = await Promise.all(
    children.map((child) => readEntry(child, path)),
  );
  return nested.flat();
}

/**
 * `readEntries` hands back at most 100 entries per call and signals the end with an empty
 * batch, so the reader has to be drained in a loop.
 */
function readAllEntries(
  reader: FileSystemDirectoryReader,
): Promise<readonly FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const collected: FileSystemEntry[] = [];
    const readBatch = (): void => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(collected);
          return;
        }
        collected.push(...batch);
        readBatch();
      }, reject);
    };
    readBatch();
  });
}

function pathOf(file: File): string {
  // Browsers only fill this in for folder picks, and leave it empty otherwise.
  return file.webkitRelativePath || file.name;
}

function isEntry(entry: FileSystemEntry | null): entry is FileSystemEntry {
  return entry !== null;
}

function isFileEntry(entry: FileSystemEntry): entry is FileSystemFileEntry {
  return entry.isFile;
}

function isDirectoryEntry(
  entry: FileSystemEntry,
): entry is FileSystemDirectoryEntry {
  return entry.isDirectory;
}
