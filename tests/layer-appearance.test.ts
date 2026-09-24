import { describe, expect, it } from "vitest";
import { appearanceOf } from "../src/viewer/layer-appearance";

/** A layer as the layer panel describes it: on or off, and how solid. */
function layer(id: string, visible = true, opacity = 1) {
  return { id, visible, opacity };
}

describe("how a layer is shown", () => {
  it("draws a layer the user left on, and not one they turned off", () => {
    expect(appearanceOf(layer("upper"), null).visible).toBe(true);
    expect(appearanceOf(layer("upper", false), null).visible).toBe(false);
  });

  it("draws only the layer that was put on its own", () => {
    expect(appearanceOf(layer("upper"), "upper").visible).toBe(true);
    expect(appearanceOf(layer("lower"), "upper").visible).toBe(false);
  });

  it("leaves the others' own switches where they were, so the previous view comes back", () => {
    const lower = layer("lower", false);

    expect(appearanceOf(lower, "upper").visible).toBe(false);
    expect(appearanceOf(lower, null).visible).toBe(false);
    expect(appearanceOf(layer("lower"), "upper").visible).toBe(false);
    expect(appearanceOf(layer("lower"), null).visible).toBe(true);
  });
});

describe("how solid a layer is", () => {
  it("lets a see-through layer blend with what is behind it", () => {
    const faded = appearanceOf(layer("upper", true, 0.4), null);

    expect(faded.transparent).toBe(true);
    expect(faded.depthWrite).toBe(false);
  });

  it("keeps a solid layer hiding what is behind it", () => {
    const solid = appearanceOf(layer("upper"), null);

    expect(solid.transparent).toBe(false);
    expect(solid.depthWrite).toBe(true);
  });

  it("keeps drawing a layer faded all the way out, because the fader is not the switch", () => {
    const invisible = appearanceOf(layer("upper", true, 0), null);

    expect(invisible.visible).toBe(true);
    expect(invisible.transparent).toBe(true);
  });
});
