const COUNT_FORMAT = new Intl.NumberFormat();

/** `460851` -> `460,851` */
export function formatCount(value: number): string {
  return COUNT_FORMAT.format(value);
}

/** A matrix-style number: whole values stay whole, fractions lose trailing zeros. */
export function formatValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

/** `2e-7` -> `0.0000002`; keeps tiny matrix entries readable. */
export function formatCompact(value: number): string {
  if (value !== 0 && Math.abs(value) < 0.0001) return value.toExponential(1);
  return formatValue(value);
}
