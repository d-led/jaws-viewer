import type { DentalProject } from "./dental-project";
import type { Matrix4Entries } from "./matrix4";
import type { ScanLayer } from "./scan-layer";

/** Everything a single export folder or archive holds, after parsing. */
export interface DentalBundle {
  readonly project: DentalProject | null;
  /** The `.matrix4` transform shipped next to the scans, if any. */
  readonly matrix: Matrix4Entries | null;
  readonly scans: readonly ScanLayer[];
  /** File names that were dropped but could not be used, for reporting back to the user. */
  readonly skipped: readonly string[];
}

export const EMPTY_BUNDLE: DentalBundle = {
  project: null,
  matrix: null,
  scans: [],
  skipped: [],
};

export function totalTriangles(bundle: DentalBundle): number {
  return bundle.scans.reduce((sum, scan) => sum + (scan.triangleCount ?? 0), 0);
}
