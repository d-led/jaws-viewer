import { describe, expect, it } from "vitest";
import { defaultColour } from "../src/ui/palette";
import { formatCompact, formatCount, formatValue } from "../src/support/format";

describe("layer colours", () => {
  it("gives the upper and lower jaw different colours", () => {
    expect(defaultColour("upper", 0)).not.toBe(defaultColour("lower", 0));
  });

  it("distinguishes two scans of the same kind", () => {
    expect(defaultColour("total", 0)).not.toBe(defaultColour("total", 1));
  });

  it("keeps producing a colour beyond the end of the palette", () => {
    expect(defaultColour("total", 3)).toBe(defaultColour("total", 0));
    expect(defaultColour("other", 9)).toMatch(/^#/);
  });
});

describe("formatting numbers for display", () => {
  it("groups triangle counts", () => {
    expect(formatCount(460851)).toBe("460,851");
  });

  it("keeps whole matrix values whole and trims fractions", () => {
    expect(formatValue(-1)).toBe("-1");
    expect(formatValue(-22.5)).toBe("-22.5");
    expect(formatValue(0.5)).toBe("0.5");
  });

  it("shortens values that would otherwise read as zero", () => {
    expect(formatCompact(0.0000002)).toBe("2.0e-7");
    expect(formatCompact(0)).toBe("0");
  });
});
