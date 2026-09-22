import type { StandardView, Viewport } from "../viewer/viewport";
import { button, el, iconButton } from "./dom";

interface ViewButton {
  readonly view: StandardView;
  readonly label: string;
  /** Kept on screen where there is room; a phone shows only the two that matter most. */
  readonly primary?: boolean;
}

const VIEWS: readonly ViewButton[] = [
  { view: "top", label: "Top", primary: true },
  { view: "front", label: "Front", primary: true },
  { view: "bottom", label: "Bottom" },
  { view: "back", label: "Back" },
  { view: "left", label: "Left" },
  { view: "right", label: "Right" },
];

/** Overlays the canvas: snap-to-axis views and a way to put the model back in frame. */
export function createViewToolbar(viewport: Viewport): HTMLElement {
  const viewButtons = VIEWS.map(({ view, label, primary }) =>
    button(label, () => viewport.setView(view), {
      class:
        primary === true
          ? "button button--small"
          : "button button--small toolbar__extra",
      title: `${label} view`,
    }),
  );

  return el("div", { class: "toolbar" }, [
    el("div", { class: "toolbar__group" }, viewButtons),
    el("div", { class: "toolbar__group" }, [
      iconButton("recentre", "Re-center everything", () => viewport.fitAll(), {
        class: "button button--small button--icon",
      }),
    ]),
  ]);
}
