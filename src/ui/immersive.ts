import { iconButton } from "./dom";

export interface ImmersiveMode {
  /** The switch in the sidebar, which is also the one that turns the mode off again. */
  readonly toggle: HTMLButtonElement;
}

const FILL_LABEL = "Fill the screen with the model";
const EXIT_LABEL = "Show the side panel";

/**
 * A view that fills the window with the model, with the controls floating over it.
 *
 * Deliberately not `requestFullscreen`: on a phone that hides the browser chrome and leaves the
 * page as it was, which is not what "full screen" means here — and iOS refuses it on anything
 * that is not a video. Filling the viewport with a class works the same everywhere, and the
 * floating controls stay reachable.
 *
 * The filled view is left with Escape, which is the key a desktop keyboard reaches for when a
 * view has taken over the window.
 */
export function createImmersiveMode(options: {
  readonly app: HTMLElement;
  readonly stage: HTMLElement;
}): ImmersiveMode {
  const { app, stage } = options;

  const isFilled = (): boolean => app.classList.contains("is-immersive");

  const setFilled = (filled: boolean): void => {
    app.classList.toggle("is-immersive", filled);
    const label = filled ? EXIT_LABEL : FILL_LABEL;
    for (const control of [toggle, exit]) {
      control.setAttribute("aria-label", label);
      control.title = label;
    }
  };

  const toggle = iconButton("fullscreen", FILL_LABEL, () =>
    setFilled(!isFilled()),
  );
  const exit = iconButton("exit", EXIT_LABEL, () => setFilled(false), {
    class: "button button--icon button--accent stage__exit",
    attrs: { "aria-keyshortcuts": "Escape" },
  });

  toggle.setAttribute("aria-pressed", "false");
  stage.append(exit);

  window.addEventListener("keydown", (event) => {
    // Only when there is something to leave, so the key stays the browser's otherwise.
    if (event.key === "Escape" && isFilled()) setFilled(false);
  });

  return { toggle };
}
