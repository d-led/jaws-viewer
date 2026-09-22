import type { ScanKind } from "../domain/scan-layer";

/** At least one colour, so cycling never comes up empty. */
type Palette = readonly [string, ...string[]];

const FALLBACK = "#a0aec0";

const PALETTES: Record<ScanKind, Palette> = {
  upper: ["#63b3ed", "#4c8cc4", "#8ecdf7"],
  lower: ["#ed8936", "#c96f27", "#f5b071"],
  total: ["#68d391", "#b794f4", "#4fd1c5"],
  other: [FALLBACK, "#718096"],
};

/**
 * Colours scans so that layers stay tellable apart on screen, and repeats the sequence
 * when a bundle holds more scans of one kind than the palette has entries.
 */
export function defaultColour(kind: ScanKind, indexWithinKind: number): string {
  const palette = PALETTES[kind];
  return palette[indexWithinKind % palette.length] ?? FALLBACK;
}
