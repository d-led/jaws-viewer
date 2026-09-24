// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  LAYER_SURFACES,
  type LayerSettings,
} from "../src/domain/view-settings";
import { createLayersPanel, type LayerView } from "../src/ui/layers-panel";
import { FakeViewport } from "./fake-viewport";

function settings(patch: Partial<LayerSettings> = {}): LayerSettings {
  return {
    visible: true,
    opacity: 1,
    colour: "#63b3ed",
    placedByMatrix: false,
    ...patch,
  };
}

function layer(
  id: string,
  label: string,
  patch: Partial<LayerSettings> = {},
): LayerView {
  return {
    id,
    label,
    kind: "upper",
    triangleCount: 219232,
    settings: settings(patch),
  };
}

function panelWith(...layers: readonly LayerView[]) {
  const controller = new FakeViewport();
  const panel = createLayersPanel(controller);
  panel.show(layers, true, null);
  return { controller, panel, element: panel.element };
}

function opacitySliders(element: HTMLElement): HTMLInputElement[] {
  return [...element.querySelectorAll<HTMLInputElement>(".layer__opacity")];
}

function visibilityBoxes(element: HTMLElement): HTMLInputElement[] {
  return [...element.querySelectorAll<HTMLInputElement>(".layer__visibility")];
}

function colourInputs(element: HTMLElement): HTMLInputElement[] {
  return [...element.querySelectorAll<HTMLInputElement>(".layer__colour")];
}

function soloButtons(element: HTMLElement): HTMLButtonElement[] {
  return [...element.querySelectorAll<HTMLButtonElement>(".layer__solo")];
}

function surfaceSelects(element: HTMLElement): HTMLSelectElement[] {
  return [...element.querySelectorAll<HTMLSelectElement>(".layer__surface")];
}

function smoothingRows(element: HTMLElement): HTMLElement[] {
  return [...element.querySelectorAll<HTMLElement>(".layer__smoothing-row")];
}

function smoothingSliders(element: HTMLElement): HTMLInputElement[] {
  return [...element.querySelectorAll<HTMLInputElement>(".layer__smoothing")];
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined)
    throw new Error(`Expected an element at index ${index}.`);
  return item;
}

function drag(slider: HTMLInputElement, percent: number): void {
  slider.value = String(percent);
  slider.dispatchEvent(new Event("input", { bubbles: true }));
}

function toggle(box: HTMLInputElement, checked: boolean): void {
  box.checked = checked;
  box.dispatchEvent(new Event("change", { bubbles: true }));
}

function choose(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("the layers panel", () => {
  it("shows a row per layer, named and counted, with the grid listed after them", () => {
    const { element } = panelWith(
      layer("upper", "Upper Jaw"),
      layer("lower", "Lower Jaw"),
    );

    expect(element.querySelectorAll(".layer:not(.layer--helper)")).toHaveLength(
      2,
    );
    expect(element.textContent).toContain("Upper Jaw");
    expect(element.textContent).toContain("219,232 triangles");
    expect(element.querySelectorAll(".layer--helper")).toHaveLength(1);
  });

  it("shows each layer at the settings it is to be shown at", () => {
    const { element } = panelWith(
      layer("upper", "Upper Jaw", {
        visible: false,
        opacity: 0.4,
        colour: "#ff8800",
      }),
      layer("lower", "Lower Jaw"),
    );

    expect(at(visibilityBoxes(element), 0).checked).toBe(false);
    expect(at(visibilityBoxes(element), 1).checked).toBe(true);
    expect(at(opacitySliders(element), 0).value).toBe("40");
    expect(element.textContent).toContain("40%");
    expect(at(colourInputs(element), 0).value).toBe("#ff8800");
  });

  it("says nothing to the controller until something is touched", () => {
    const { controller } = panelWith(
      layer("upper", "Upper Jaw", { opacity: 0.4 }),
    );

    expect(controller.opacityChanges).toEqual([]);
    expect(controller.visibilityChanges).toEqual([]);
    expect(controller.colourChanges).toEqual([]);
  });

  it("reports transparency as the slider moves", () => {
    const { controller, element } = panelWith(
      layer("upper", "Upper Jaw"),
      layer("lower", "Lower Jaw"),
    );

    drag(at(opacitySliders(element), 1), 35);

    expect(controller.opacityChanges).toEqual([{ id: "lower", opacity: 0.35 }]);
    expect(element.textContent).toContain("35%");
  });

  it("reports a layer being shown or hidden", () => {
    const { controller, element } = panelWith(layer("upper", "Upper Jaw"));

    toggle(at(visibilityBoxes(element), 0), false);

    expect(controller.visibilityChanges).toEqual([
      { id: "upper", visible: false },
    ]);
  });

  it("reports the colour the user picks", () => {
    const { controller, element } = panelWith(layer("upper", "Upper Jaw"));
    const colour = at(colourInputs(element), 0);

    colour.value = "#ff0000";
    colour.dispatchEvent(new Event("input", { bubbles: true }));

    expect(controller.colourChanges).toEqual([
      { id: "upper", colour: "#ff0000" },
    ]);
  });

  it("solos a layer, then brings the others back when soloed again", () => {
    const { controller, element } = panelWith(
      layer("upper", "Upper Jaw"),
      layer("lower", "Lower Jaw"),
    );
    const solo = at(soloButtons(element), 1);

    solo.click();
    expect(controller.isolated).toBe("lower");
    expect(solo.getAttribute("aria-pressed")).toBe("true");
    expect(at(soloButtons(element), 0).getAttribute("aria-pressed")).toBe(
      "false",
    );

    solo.click();
    expect(controller.isolated).toBeNull();
    expect(solo.getAttribute("aria-pressed")).toBe("false");
  });

  it("moves the solo button onto the layer that was soloed last", () => {
    const { controller, element } = panelWith(
      layer("upper", "Upper Jaw"),
      layer("lower", "Lower Jaw"),
    );

    at(soloButtons(element), 0).click();
    at(soloButtons(element), 1).click();

    expect(controller.isolated).toBe("lower");
    expect(
      soloButtons(element).map((button) => button.getAttribute("aria-pressed")),
    ).toEqual(["false", "true"]);
  });

  it("shows the layer that was left on its own, when the layers are shown again", () => {
    const controller = new FakeViewport();
    const panel = createLayersPanel(controller);
    const jaws = [layer("upper", "Upper Jaw"), layer("lower", "Lower Jaw")];
    panel.show(jaws, true, null);

    panel.show(jaws, true, "lower");

    expect(
      soloButtons(panel.element).map((button) =>
        button.getAttribute("aria-pressed"),
      ),
    ).toEqual(["false", "true"]);
  });

  it("shows no solo when nothing was left on its own", () => {
    const controller = new FakeViewport();
    const panel = createLayersPanel(controller);
    const jaws = [layer("upper", "Upper Jaw"), layer("lower", "Lower Jaw")];
    panel.show(jaws, true, null);
    at(soloButtons(panel.element), 0).click();

    panel.show(jaws, true, null);

    expect(
      soloButtons(panel.element).map((button) =>
        button.getAttribute("aria-pressed"),
      ),
    ).toEqual(["false", "false"]);
  });

  it("lists the grid beside the layers, switched the same way", () => {
    const { controller, element } = panelWith(layer("upper", "Upper Jaw"));

    const grid = element.querySelector<HTMLInputElement>(
      ".layer--helper input",
    );
    expect(grid?.checked).toBe(true);

    if (grid === null) throw new Error("Expected a grid switch.");
    grid.checked = false;
    grid.dispatchEvent(new Event("change", { bubbles: true }));

    expect(controller.gridVisible).toBe(false);
  });
});

describe("the surface of a layer", () => {
  it("offers a layer's own colour and every scalar it can be shown by", () => {
    const { element } = panelWith(layer("upper", "Upper Jaw"));

    expect(
      [...at(surfaceSelects(element), 0).options].map((option) => option.value),
    ).toEqual([...LAYER_SURFACES]);
  });

  it("shows the surface and the smoothing a layer is being looked at with", () => {
    const { element } = panelWith(
      layer("upper", "Upper Jaw", { surface: "sharpness", smoothing: 4 }),
    );

    expect(at(surfaceSelects(element), 0).value).toBe("sharpness");
    expect(at(smoothingSliders(element), 0).value).toBe("4");
    expect(element.textContent).toContain("4 passes");
  });

  it("reports the scalar the user picks", () => {
    const { controller, element } = panelWith(layer("upper", "Upper Jaw"));

    choose(at(surfaceSelects(element), 0), "mean");

    expect(controller.surfaceChanges).toEqual([
      { id: "upper", surface: "mean" },
    ]);
  });

  it("reports how hard the curvature is smoothed", () => {
    const { controller, element } = panelWith(
      layer("upper", "Upper Jaw", { surface: "mean" }),
    );

    drag(at(smoothingSliders(element), 0), 5);

    expect(controller.smoothingChanges).toEqual([
      { id: "upper", smoothing: 5 },
    ]);
    expect(element.textContent).toContain("5 passes");
  });

  it("keeps the smoothing out of the way until a curvature is showing", () => {
    const { element } = panelWith(layer("upper", "Upper Jaw"));

    expect(at(smoothingRows(element), 0).hidden).toBe(true);
  });

  it("brings the smoothing out with a curvature, and puts it away again", () => {
    const { element } = panelWith(layer("upper", "Upper Jaw"));
    const select = at(surfaceSelects(element), 0);

    choose(select, "sharpness");
    expect(at(smoothingRows(element), 0).hidden).toBe(false);

    choose(select, "colour");
    expect(at(smoothingRows(element), 0).hidden).toBe(true);
  });

  it("reads out smoothing that is off", () => {
    const { element } = panelWith(
      layer("upper", "Upper Jaw", { surface: "mean", smoothing: 0 }),
    );

    expect(element.textContent).toContain("off");
  });

  it("explains what each way of surfacing a layer means", () => {
    const { element } = panelWith(layer("upper", "Upper Jaw"));

    const options = [...at(surfaceSelects(element), 0).options];
    expect(options.map((option) => option.title.length > 30)).toEqual(
      options.map(() => true),
    );
  });

  it("says of sharpness that it is a difference, not the primary curvature", () => {
    const { element } = panelWith(layer("upper", "Upper Jaw"));

    const options = [...at(surfaceSelects(element), 0).options];
    const sharpness = options.find((option) => option.value === "sharpness");

    // Read as text because an option's `label` is the attribute, which is not set here.
    expect(sharpness?.textContent).toContain("k₁ − k₂");
    expect(sharpness?.title).toContain("Not k₁");
  });

  it("explains what the surface control is showing, and follows the choice", () => {
    const { element } = panelWith(layer("upper", "Upper Jaw"));
    const select = at(surfaceSelects(element), 0);
    expect(select.title).toContain("own colour");

    choose(select, "mean");

    expect(select.title).toContain("averaged");
  });
});
