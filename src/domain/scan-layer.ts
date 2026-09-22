/** The anatomical part an STL in the export represents, inferred from its file name. */
export type ScanKind = "upper" | "lower" | "total" | "other";

export interface ScanLayer {
  /** Unique within a bundle. Derived from the file name, which the export keeps unique. */
  readonly id: string;
  readonly fileName: string;
  /** Human-readable label, e.g. `Upper jaw`. */
  readonly label: string;
  readonly kind: ScanKind;
  /** Triangle count read from the STL header, or `null` when it cannot be determined. */
  readonly triangleCount: number | null;
  readonly stl: ArrayBuffer;
}

export function classifyScan(fileName: string): ScanKind {
  if (/upper|maxill/i.test(fileName)) return "upper";
  if (/lower|mandib/i.test(fileName)) return "lower";
  if (/total/i.test(fileName)) return "total";
  return "other";
}

/**
 * Turns an export file name into a short label.
 *
 * `123_123_Example Practice-UpperJaw.stl` becomes `Upper Jaw` — the qualifier before the last
 * dash repeats the case details already shown in the metadata, so only the trailing part is kept.
 */
export function labelForScan(fileName: string): string {
  const stem = stripExtension(baseName(fileName));
  const qualifier = stem.slice(stem.lastIndexOf("-") + 1);
  return humanize(qualifier) || stem || fileName;
}

function baseName(fileName: string): string {
  const separator = Math.max(
    fileName.lastIndexOf("/"),
    fileName.lastIndexOf("\\"),
  );
  return separator === -1 ? fileName : fileName.slice(separator + 1);
}

function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot <= 0 ? fileName : fileName.slice(0, dot);
}

/** `TotalJaw0` -> `Total Jaw 0` */
function humanize(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}
