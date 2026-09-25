import { el } from "./dom";

/** How long a message stays up: long enough to read, short enough to be out of the way. */
export const VISIBLE_MS = 2600;

export interface Toast {
  readonly element: HTMLElement;
  show(message: string): void;
}

/**
 * A short message over the model, for something the viewer has no control to show.
 *
 * The orbit centre is one of those: a held finger sets it and re-centering puts it back, and neither
 * is visible on a control.
 */
export function createToast(): Toast {
  const element = el("p", {
    class: "toast",
    attrs: { role: "status", hidden: "" },
  });
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    element,
    show: (message) => {
      element.textContent = message;
      element.hidden = false;

      // Saying something else restarts the clock, rather than letting the first message's timer take
      // the second one off the screen.
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        element.hidden = true;
        timer = null;
      }, VISIBLE_MS);
    },
  };
}
