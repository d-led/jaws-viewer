import { el, inputValue } from "./dom";
import type { ViewController } from "./view-controller";

export interface SeparationControl {
  readonly element: HTMLElement;
  /** Shows where the assembly was left. The app applies the value; this only displays it. */
  show(factor: number): void;
}

/**
 * The slider that opens the bite: the layers spread apart along the occlusal axis, so the
 * surfaces that were touching become visible.
 */
export function createSeparationControl(
  controller: ViewController,
): SeparationControl {
  const readout = el("output", {
    class: "separation__value readout",
    text: "0%",
  });

  const slider = el("input", {
    class: "separation__slider",
    title: "Spread the layers apart along the occlusal axis",
    attrs: { type: "range", min: "0", max: "100", step: "1", value: "0" },
    on: {
      input: (event) => {
        const percent = Number(inputValue(event));
        readout.textContent = `${percent}%`;
        controller.setSeparation(percent / 100);
      },
    },
  });

  const element = el("section", { class: "card" }, [
    el("h2", { class: "card__title", text: "Open / explode" }),
    el("div", { class: "separation" }, [slider, readout]),
    el("p", {
      class: "hint",
      text: "Lifts each layer along the occlusal axis in proportion to how high it sits.",
    }),
  ]);

  return {
    element,
    show(factor) {
      const percent = Math.round(factor * 100);
      slider.value = String(percent);
      readout.textContent = `${percent}%`;
    },
  };
}
