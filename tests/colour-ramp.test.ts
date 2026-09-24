import { describe, expect, it } from "vitest";
import {
  curvatureColour,
  rampGradient,
  type Rgb,
} from "../src/domain/colour-ramp";

/** What a screen shows for a linear channel: the transfer the renderer applies on the way out. */
function shown(linear: number): number {
  return linear <= 0.0031308
    ? linear * 12.92
    : 1.055 * linear ** (1 / 2.4) - 0.055;
}

function brightness([r, g, b]: Rgb): number {
  return r + g + b;
}

describe("the curvature ramp", () => {
  it("shows a groove blue and a cusp red", () => {
    const [grooveRed, , grooveBlue] = curvatureColour(-1, true);
    const [cuspRed, , cuspBlue] = curvatureColour(1, true);

    expect(grooveBlue).toBeGreaterThan(grooveRed);
    expect(cuspRed).toBeGreaterThan(cuspBlue);
  });

  it("shows flat as the lightest point of a signed map", () => {
    const flat = curvatureColour(0, true);

    expect(Math.abs(flat[0] - flat[1])).toBeLessThan(0.02);
    expect(brightness(flat)).toBeGreaterThan(
      brightness(curvatureColour(1, true)),
    );
    expect(brightness(flat)).toBeGreaterThan(
      brightness(curvatureColour(-1, true)),
    );
  });

  it("gives a magnitude no middle to read, because it has none", () => {
    // Nothing is cold and everything is warm: a magnitude has no zero for a neutral colour to stand
    // for, so its ramp does not pass through one.
    const [nothingRed, , nothingBlue] = curvatureColour(0, false);
    const [everythingRed, , everythingBlue] = curvatureColour(1, false);

    expect(nothingBlue).toBeGreaterThan(nothingRed);
    expect(everythingRed).toBeGreaterThan(everythingBlue);
    expect(brightness(curvatureColour(0, false))).toBeLessThan(
      brightness(curvatureColour(0.5, false)),
    );
  });

  it("writes the ramp in the linear light a renderer works in", () => {
    // The stops are chosen by what a screen shows them as, so each end has to come back as that
    // colour rather than as the paler one its linear value would otherwise display as.
    expect(shown(curvatureColour(0, true)[0])).toBeCloseTo(0.88, 3);
    expect(shown(curvatureColour(-1, true)[2])).toBeCloseTo(0.9, 3);
    expect(shown(curvatureColour(1, true)[0])).toBeCloseTo(0.85, 3);
  });

  it("stays on the ramp for a value off the end of it", () => {
    expect(curvatureColour(-9, true)).toEqual(curvatureColour(-1, true));
    expect(curvatureColour(9, true)).toEqual(curvatureColour(1, true));
  });

  it("draws its legend in the colours a screen shows, not the ones the renderer wants", () => {
    const gradient = rampGradient(true);

    expect(gradient.startsWith("linear-gradient(to right, ")).toBe(true);
    expect(gradient).toContain("rgb(61 102 230)");
    expect(gradient).toContain("rgb(224 224 224)");
    expect(gradient).toContain("rgb(217 33 38)");
  });

  it("draws a different legend for a magnitude than for a signed scalar", () => {
    expect(rampGradient(false)).not.toBe(rampGradient(true));
  });
});
