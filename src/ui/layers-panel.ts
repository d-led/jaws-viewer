import type { ScanKind } from "../domain/scan-layer";
import type { LayerSettings } from "../domain/view-settings";
import { formatCount } from "../support/format";
import { button, checkbox, el, inputValue } from "./dom";
import type { ViewController } from "./view-controller";

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
   * control itself is the source of what it displays.
   */
  show(layers: readonly LayerView[], gridVisible: boolean): void;
}

/** One layer's visibility, colour, transparency and solo control. */
export function createLayersPanel(controller: ViewController): LayersPanel {
  const list = el("div", { class: "layers" });
  let soloedId: string | null = null;

  const applySolo = (id: string | null): void => {
    soloedId = soloedId === id ? null : id;
    controller.isolate(soloedId);
    for (const soloButton of list.querySelectorAll<HTMLButtonElement>(
      ".layer__solo",
    )) {
      soloButton.setAttribute(
        "aria-pressed",
        String(soloButton.dataset["layerId"] === soloedId),
      );
    }
  };

  const element = el("section", { class: "card" }, [
    el("h2", { class: "card__title", text: "Layers" }),
    list,
  ]);

  return {
    element,
    show(layers, gridVisible) {
      soloedId = null;
      list.replaceChildren(
        ...layers.map((layer) => layerRow(controller, layer, applySolo)),
        gridRow(controller, gridVisible),
      );
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
): HTMLElement {
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
  ]);

  if (layer.triangleCount !== null) {
    row.append(
      el("span", {
        class: "layer__meta",
        text: `${formatCount(layer.triangleCount)} triangles`,
      }),
    );
  }
  return row;
}

function isChecked(event: Event): boolean {
  return event.target instanceof HTMLInputElement && event.target.checked;
}
