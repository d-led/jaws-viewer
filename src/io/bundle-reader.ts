import type { DentalBundle } from "../domain/dental-bundle";
import type { DentalProject } from "../domain/dental-project";
import type { Matrix4Entries } from "../domain/matrix4";
import {
  classifyScan,
  labelForScan,
  type ScanLayer,
} from "../domain/scan-layer";
import { parseDentalProject } from "../parsing/dental-project-parser";
import { parseMatrix4 } from "../parsing/matrix4-parser";
import { sniffBundleFile, type BundleFileKind } from "../parsing/sniff";
import { readStlTriangleCount } from "../parsing/stl";
import { parseXmlDocument } from "../parsing/xml";
import { errorMessage } from "../support/errors";
import { baseName, type BundleFile } from "./bundle-file";
import { readZipEntries } from "./zip";

/** Guards against a zip bomb: archives inside archives inside archives. */
const MAX_ARCHIVE_DEPTH = 3;

const STL_KINDS = new Set<BundleFileKind>(["binary-stl", "ascii-stl"]);

interface QueuedFile {
  readonly file: BundleFile;
  readonly depth: number;
}

interface MutableBundle {
  project: DentalProject | null;
  matrix: Matrix4Entries | null;
  scans: ScanLayer[];
  skipped: string[];
}

/**
 * Reads whichever files make up an export — loose scans, a whole folder, or the same
 * contents inside a zip — and sorts them into a bundle.
 *
 * Files are identified by content, so extension-less and misnamed files still load.
 * Anything unusable is reported in `skipped` instead of failing the whole load, because a
 * vendor folder often carries extras a viewer has no use for.
 */
export function readBundle(files: readonly BundleFile[]): DentalBundle {
  const bundle: MutableBundle = {
    project: null,
    matrix: null,
    scans: [],
    skipped: [],
  };
  const queue: QueuedFile[] = files.map((file) => ({ file, depth: 0 }));

  while (queue.length > 0) {
    const queued = queue.shift();
    if (queued === undefined) break;
    absorb(bundle, queued, queue);
  }
  return bundle;
}

function absorb(
  bundle: MutableBundle,
  queued: QueuedFile,
  queue: QueuedFile[],
): void {
  const kind = sniffBundleFile(queued.file.bytes);

  if (kind === "zip") {
    expandArchive(bundle, queued, queue);
    return;
  }
  if (STL_KINDS.has(kind)) {
    bundle.scans.push(toScanLayer(queued.file, kind, queued.file.bytes));
    return;
  }
  if (kind === "xml") {
    absorbXml(bundle, queued.file);
    return;
  }
  bundle.skipped.push(`${baseName(queued.file.path)} (unrecognised file type)`);
}

function expandArchive(
  bundle: MutableBundle,
  queued: QueuedFile,
  queue: QueuedFile[],
): void {
  if (queued.depth >= MAX_ARCHIVE_DEPTH) {
    bundle.skipped.push(
      `${baseName(queued.file.path)} (archives nested more than ${MAX_ARCHIVE_DEPTH} deep)`,
    );
    return;
  }

  try {
    for (const entry of readZipEntries(queued.file.bytes)) {
      queue.push({ file: entry, depth: queued.depth + 1 });
    }
  } catch (error) {
    bundle.skipped.push(
      `${baseName(queued.file.path)} (${errorMessage(error)})`,
    );
  }
}

function absorbXml(bundle: MutableBundle, file: BundleFile): void {
  try {
    const document = parseXmlDocument(new TextDecoder().decode(file.bytes));
    if (document.rootName === "Treatment") {
      bundle.project = parseDentalProject(document);
      return;
    }
    if (document.rootName === "Matrix4") {
      bundle.matrix = parseMatrix4(document);
      return;
    }
    bundle.skipped.push(
      `${baseName(file.path)} (unrecognised XML root <${document.rootName}>)`,
    );
  } catch (error) {
    bundle.skipped.push(`${baseName(file.path)} (${errorMessage(error)})`);
  }
}

function toScanLayer(
  file: BundleFile,
  kind: BundleFileKind,
  bytes: Uint8Array,
): ScanLayer {
  const fileName = baseName(file.path);
  return {
    id: file.path,
    fileName,
    label: labelForScan(fileName),
    kind: classifyScan(fileName),
    triangleCount: readStlTriangleCount(bytes, kind),
    stl: toArrayBuffer(bytes),
  };
}

/**
 * Copies the bytes into an ArrayBuffer of their own. Zip entries are views into one
 * shared decompression buffer, and three.js needs one buffer per geometry.
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
