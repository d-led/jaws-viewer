import { describe, expect, it } from "vitest";
import {
  EMPTY_VIEW_SETTINGS,
  defaultLayerSettings,
  isViewSettings,
  keepingLayers,
  layerSettingsIn,
  withLayerSettings,
  withSeparation,
  type LayerSettings,
} from "../src/domain/view-settings";

const UPPER: LayerSettings = {
  visible: true,
  opacity: 0.5,
  colour: "#123456",
  placedByMatrix: true,
};

function viewWith(
  layers: Readonly<Record<string, LayerSettings>>,
  separation = 0,
) {
  return { separation, layers };
}

describe("the settings remembered for a layer", () => {
  it("are the defaults for a layer nothing was remembered for", () => {
    const defaults = defaultLayerSettings("#abcdef");

    expect(layerSettingsIn(EMPTY_VIEW_SETTINGS, "upper", defaults)).toEqual(
      defaults,
    );
  });

  it("are what was remembered, where there is something", () => {
    expect(
      layerSettingsIn(
        viewWith({ upper: UPPER }),
        "upper",
        defaultLayerSettings("#abcdef"),
      ),
    ).toEqual(UPPER);
  });

  it("come back clamped, however they were written", () => {
    const wild = { ...UPPER, opacity: 4 };

    expect(
      layerSettingsIn(
        viewWith({ upper: wild }),
        "upper",
        defaultLayerSettings("#abcdef"),
      ).opacity,
    ).toBe(1);
  });

  it("ignore a layer the remembered view does not have", () => {
    const view = viewWith({ lower: UPPER });

    expect(
      layerSettingsIn(view, "upper", defaultLayerSettings("#abcdef")).colour,
    ).toBe("#abcdef");
  });
});

describe("editing a view", () => {
  it("changes one field of one layer and leaves the rest alone", () => {
    const view = viewWith({ upper: UPPER, lower: { ...UPPER, opacity: 1 } });

    const edited = withLayerSettings(view, "upper", { opacity: 0.25 });

    expect(edited.layers["upper"]?.opacity).toBe(0.25);
    expect(edited.layers["upper"]?.colour).toBe("#123456");
    expect(edited.layers["lower"]?.opacity).toBe(1);
  });

  it("leaves the view untouched for a layer it does not hold", () => {
    const view = viewWith({ upper: UPPER });

    expect(withLayerSettings(view, "stranger", { opacity: 0 }) === view).toBe(
      true,
    );
  });

  it("does not make a new view when the separation is set to what it already was", () => {
    const view = viewWith({}, 0.4);

    expect(withSeparation(view, 0.4) === view).toBe(true);
    expect(withSeparation(view, 0.6).separation).toBe(0.6);
  });

  it("keeps the separation when narrowing to the layers of a bundle", () => {
    const view = viewWith({ upper: UPPER, stranger: UPPER }, 0.7);

    const narrowed = keepingLayers(view, { upper: UPPER });

    expect(narrowed.separation).toBe(0.7);
    expect(Object.keys(narrowed.layers)).toEqual(["upper"]);
  });
});

describe("reading a stored view back", () => {
  it("accepts a view this version could have written", () => {
    expect(isViewSettings(viewWith({ upper: UPPER }))).toBe(true);
    expect(isViewSettings(EMPTY_VIEW_SETTINGS)).toBe(true);
  });

  it("accepts a camera, and a view stored before cameras were remembered", () => {
    const camera = { position: [0, -40, 20], target: [0, 0, 5] };

    expect(isViewSettings({ ...viewWith({ upper: UPPER }), camera })).toBe(
      true,
    );
    expect(isViewSettings({ separation: 0, layers: {} })).toBe(true);
  });

  it("refuses a camera that is not a pair of points", () => {
    const broken = [
      { position: [0, 0], target: [0, 0, 0] },
      { position: [0, 0, "up"], target: [0, 0, 0] },
      { position: [0, 0, 0] },
    ];

    for (const camera of broken) {
      expect(isViewSettings({ separation: 0, layers: {}, camera })).toBe(false);
    }
  });

  it("refuses anything else rather than passing it to the UI", () => {
    expect(isViewSettings(null)).toBe(false);
    expect(isViewSettings("a view")).toBe(false);
    expect(isViewSettings({ separation: 0 })).toBe(false);
    expect(isViewSettings({ separation: "half", layers: {} })).toBe(false);
    expect(
      isViewSettings({ separation: 0, layers: { upper: { visible: true } } }),
    ).toBe(false);
    expect(
      isViewSettings({
        separation: 0,
        layers: { upper: { ...UPPER, opacity: "a lot" } },
      }),
    ).toBe(false);
  });
});
