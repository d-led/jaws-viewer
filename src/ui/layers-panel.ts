import { rampGradient } from "../domain/colour-ramp";
import { curvatureKindIsSigned, type CurvatureKind } from "../domain/curvature";
import type { ScanKind } from "../domain/scan-layer";
import {
  MAX_SMOOTHING,
  smoothingOf,
  surfaceOf,
  type LayerSettings,
  type LayerSurface,
} from "../domain/view-settings";
import { formatCompact, formatCount } from "../support/format";
import { button, checkbox, el, inputValue, selectedValue } from "./dom";
import type { ViewController } from "./view-controller";

/**
 * Every way of surfacing a layer: what it is called, and what it means.
 *
 * The labels cannot be derived from the values, so this is written out; a test holds the values to
 * `LAYER_SURFACES` so the two cannot drift apart. The descriptions are the answer to "what am I
 * looking at?", which a name like *Sharpness* on its own does not give — it is k₁ − k₂, and k₁ is
 * the primary curvature.
 */
const SURFACE_OPTIONS: readonly {
  readonly value: LayerSurface;
  readonly label: string;
  readonly description: string;
}[] = [
  {
    value: "colour",
    label: "Own colour",
    description:
      "Show this layer in its own colour, lit and shaded like the rest of the scene.",
  },
  {
    value: "k1",
    label: "Primary curvature (k₁)",
    description:
      "How tightly the surface bends in the direction it bends most, signed: positive where it bulges outwards, negative where it dips inwards. In 1/mm, so 0.5 is a radius of two millimetres.",
  },
  {
    value: "k2",
    label: "Secondary curvature (k₂)",
    description:
      "The same across the direction at right angles to that one. Nought along a ridge, a cylinder or any straight edge.",
  },
  {
    value: "mean",
    label: "Mean curvature (k₁+k₂)/2",
    description:
      "The two principal curvatures averaged: positive where the surface bulges out on balance, negative where it dips in. The plainest reading of ridge against groove.",
  },
  {
    value: "gaussian",
    label: "Gaussian curvature (k₁·k₂)",
    description:
      "The two multiplied together: positive on a dome or a bowl, negative on a saddle, and nought wherever either direction is flat.",
  },
  {
    value: "curvedness",
    label: "Curvedness",
    description:
      "How curved the surface is, whichever way it goes: a dome and a bowl of the same tightness read alike. Says nothing about which way round it is.",
  },
  {
    value: "sharpness",
    label: "Sharpness (k₁ − k₂)",
    description:
      "How much the surface is a crease rather than a dome, k₁ − k₂: nothing on a sphere, most along a ridge, a margin or a fissure. Not k₁ — that is the primary curvature.",
  },
];

/**
 * A curvature is a change of direction per millimetre — except the Gaussian one, which is that per
 * millimetre twice over.
 */
const UNITS: Record<CurvatureKind, string> = {
  k1: "1/mm",
  k2: "1/mm",
  mean: "1/mm",
  gaussian: "1/mm²",
  curvedness: "1/mm",
  sharpness: "1/mm",
};

/** The range a layer's surface was measured over, which is what its legend prints. */
export interface CurvatureLegend {
  readonly scalar: CurvatureKind;
  readonly min: number;
  readonly max: number;
}

export interface LayerView {
  readonly id: string;
  readonly label: string;
  readonly kind: ScanKind;
  readonly triangleCount: number | null;
  readonly settings: LayerSettings;
}

export interface LayersPanel {
  readonly element: HTMLElement;
  /**
   * Renders the layers with the settings they are to be shown at, then the grid.
   *
   * Called when a bundle is loaded, not when a control moves: while the user is dragging, the
   * control itself is the source of what it displays. `isolated` is the layer being shown on its
   * own, which is remembered with the rest and so has to come back with it.
   */
  show(
    layers: readonly LayerView[],
    gridVisible: boolean,
    isolated: string | null,
  ): void;
  /**
   * Shows the scale a layer's surface was measured over, or takes its legend away.
   *
   * The range is not a setting but a reading, so it arrives when the measuring does rather than
   * with the settings the rest of the row is built from.
   */
  showLegend(id: string, legend: CurvatureLegend | null): void;
}

/** One layer's visibility, colour, transparency and solo control. */
export function createLayersPanel(controller: ViewController): LayersPanel {
  const list = el("div", { class: "layers" });
  /** Where each layer's legend goes, filled in when its surface has been measured. */
  const legends = new Map<string, HTMLElement>();
  let soloedId: string | null = null;

  /** Marks whichever solo button matches, which is the one control the panel does not rebuild. */
  const pressSolo = (isolated: string | null): void => {
    for (const soloButton of list.querySelectorAll<HTMLButtonElement>(
      ".layer__solo",
    )) {
      soloButton.setAttribute(
        "aria-pressed",
        String(soloButton.dataset["layerId"] === isolated),
      );
    }
  };

  const applySolo = (id: string | null): void => {
    soloedId = soloedId === id ? null : id;
    controller.isolate(soloedId);
    pressSolo(soloedId);
  };

  const element = el("section", { class: "card" }, [
    el("h2", { class: "card__title", text: "Layers" }),
    list,
  ]);

  return {
    element,
    show(layers, gridVisible, isolated) {
      soloedId = isolated;
      legends.clear();

      const rows = layers.map((layer) =>
        layerRow(controller, layer, applySolo),
      );
      for (const row of rows) legends.set(row.id, row.legend);

      list.replaceChildren(
        ...rows.map((row) => row.element),
        gridRow(controller, gridVisible),
      );
      pressSolo(soloedId);
    },

    showLegend(id, legend) {
      const place = legends.get(id);
      if (place === undefined) return;

      place.replaceChildren(...(legend === null ? [] : legendNodes(legend)));
      place.hidden = legend === null;
    },
  };
}

/** The reference grid is switched like a layer, but it is scenery rather than a scan. */
function gridRow(controller: ViewController, visible: boolean): HTMLElement {
  return el("div", { class: "layer layer--helper" }, [
    checkbox({
      label: "Grid",
      title: "Show the reference grid the layers are lifted off",
      checked: visible,
      onChange: (checked) => controller.setGridVisible(checked),
    }),
  ]);
}

function layerRow(
  controller: ViewController,
  layer: LayerView,
  onSolo: (id: string) => void,
): LayerRow {
  const { settings } = layer;

  const visibility = el("input", {
    class: "layer__visibility",
    title: "Show or hide this layer",
    attrs: {
      type: "checkbox",
      ...(settings.visible ? { checked: "checked" } : {}),
    },
    on: {
      change: (event) => controller.setLayerVisible(layer.id, isChecked(event)),
    },
  });

  const colour = el("input", {
    class: "layer__colour",
    title: "Layer colour",
    attrs: { type: "color", value: settings.colour },
    on: {
      input: (event) => controller.setLayerColour(layer.id, inputValue(event)),
    },
  });

  const opacityPercent = Math.round(settings.opacity * 100);
  const readout = el("output", {
    class: "layer__opacity-value readout",
    text: `${opacityPercent}%`,
  });
  const opacity = el("input", {
    class: "layer__opacity",
    title: "Layer transparency",
    attrs: {
      type: "range",
      min: "0",
      max: "100",
      step: "1",
      value: String(opacityPercent),
    },
    on: {
      input: (event) => {
        const percent = Number(inputValue(event));
        readout.textContent = `${percent}%`;
        controller.setLayerOpacity(layer.id, percent / 100);
      },
    },
  });

  const solo = button("Solo", () => onSolo(layer.id), {
    class: "button button--ghost layer__solo",
    title: "Show only this layer, and again to show all visible layers",
    attrs: { "aria-pressed": "false", "data-layer-id": layer.id },
  });

  const surface = el(
    "select",
    {
      class: "layer__surface",
      // The tooltip says what the control is showing, and follows it as the choice changes.
      title: descriptionOf(surfaceOf(settings)),
      on: {
        change: (event) => {
          const choice = surfaceChoice(event);
          // The panel is not rebuilt while a control moves, so the control that only applies to a
          // curvature shows and hides itself.
          smoothingRow.hidden = choice === "colour";
          surface.title = descriptionOf(choice);
          controller.setLayerSurface(layer.id, choice);
        },
      },
    },
    SURFACE_OPTIONS.map((option) =>
      el("option", {
        text: option.label,
        title: option.description,
        attrs: { value: option.value },
      }),
    ),
  );
  // Chosen through the property rather than an option's `selected` attribute: that attribute is
  // the default selection, and a control that is already in a select does not take it up.
  surface.value = surfaceOf(settings);

  const smoothingPasses = smoothingOf(settings);
  const smoothingReadout = el("output", {
    class: "layer__smoothing-value readout",
    text: passesLabel(smoothingPasses),
  });
  const smoothing = el("input", {
    class: "layer__smoothing",
    title:
      "How many times the curvature is averaged over the vertices around each one",
    attrs: {
      type: "range",
      min: "0",
      max: String(MAX_SMOOTHING),
      step: "1",
      value: String(smoothingPasses),
    },
    on: {
      input: (event) => {
        const passes = Number(inputValue(event));
        smoothingReadout.textContent = passesLabel(passes);
        controller.setLayerSmoothing(layer.id, passes);
      },
    },
  });
  const smoothingRow = el("div", { class: "layer__smoothing-row" }, [
    el("span", { class: "layer__caption", text: "Smoothing" }),
    smoothing,
    smoothingReadout,
  ]);
  smoothingRow.hidden = surfaceOf(settings) === "colour";

  // Filled in when the measuring comes back, because the range is a reading and not a setting.
  const legend = el("div", { class: "layer__legend" });
  legend.hidden = true;

  const row = el("div", { class: "layer" }, [
    el("div", { class: "layer__head" }, [
      visibility,
      colour,
      el("span", { class: "layer__label", text: layer.label }),
      solo,
    ]),
    el("div", { class: "layer__opacity-row" }, [
      el("span", { class: "layer__caption", text: "Opacity" }),
      opacity,
      readout,
    ]),
    el("div", { class: "layer__surface-row" }, [
      el("span", { class: "layer__caption", text: "Surface" }),
      surface,
    ]),
    smoothingRow,
    legend,
  ]);

  if (layer.triangleCount !== null) {
    row.append(
      el("span", {
        class: "layer__meta",
        text: `${formatCount(layer.triangleCount)} triangles`,
      }),
    );
  }
  return { id: layer.id, element: row, legend };
}

/** A layer's row, with the place its colour scale goes once its surface has been measured. */
interface LayerRow {
  readonly id: string;
  readonly element: HTMLElement;
  readonly legend: HTMLElement;
}

/**
 * The scale a surface was drawn on: the colours it ran through, what they stood for at either end,
 * and what they are measured in.
 *
 * Drawn from `rampGradient` rather than from a second copy of the colours, so a legend cannot end up
 * explaining a ramp that the surface is no longer drawn in.
 */
function legendNodes(legend: CurvatureLegend): readonly Node[] {
  const { scalar, min, max } = legend;
  const bar = el("div", {
    class: "layer__legend-bar",
    title: `${formatCompact(min)} to ${formatCompact(max)} ${UNITS[scalar]}`,
  });
  bar.style.backgroundImage = rampGradient(curvatureKindIsSigned(scalar));

  // The middle of a symmetric range is zero, which is exactly what a signed map reads as flat.
  return [
    bar,
    el("div", { class: "layer__legend-ticks" }, [
      el("span", { text: formatCompact(min) }),
      el("span", { text: formatCompact((min + max) / 2) }),
      el("span", { text: formatCompact(max) }),
    ]),
    el("span", {
      class: "layer__legend-unit",
      text: `${UNITS[scalar]} · ${labelOf(scalar)}`,
    }),
  ];
}

function isChecked(event: Event): boolean {
  return event.target instanceof HTMLInputElement && event.target.checked;
}

function surfaceChoice(event: Event): LayerSurface {
  return optionFor(selectedValue(event)).value;
}

function labelOf(surface: LayerSurface): string {
  return optionFor(surface).label;
}

function descriptionOf(surface: LayerSurface): string {
  return optionFor(surface).description;
}

function optionFor(value: string): (typeof SURFACE_OPTIONS)[number] {
  const option = SURFACE_OPTIONS.find((candidate) => candidate.value === value);
  if (option === undefined) {
    throw new Error(`"${value}" is not a way of surfacing a layer.`);
  }
  return option;
}

function passesLabel(passes: number): string {
  if (passes === 0) return "off";
  return passes === 1 ? "1 pass" : `${passes} passes`;
}
