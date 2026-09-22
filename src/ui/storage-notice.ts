import { el, iconButton } from "./dom";

export interface StorageNotice {
  readonly element: HTMLElement;
  showSaved(): void;
  showFailure(reason: string): void;
  showNothing(): void;
}

/**
 * Says whether the loaded bundle will be waiting next time, and offers to forget it.
 *
 * Kept apart from the load status because keeping a bundle can fail on its own — a full disk,
 * a private window — and that should not overwrite what was just loaded.
 */
export function createStorageNotice(options: {
  readonly onForget: () => void;
}): StorageNotice {
  const message = el("span", { class: "storage__message" });
  const forget = iconButton(
    "forget",
    "Forget the kept bundle",
    () => options.onForget(),
    {
      class: "button button--small button--icon storage__forget",
    },
  );
  forget.hidden = true;

  const element = el("p", { class: "storage", attrs: { hidden: "" } }, [
    message,
    forget,
  ]);

  const render = (
    text: string,
    tone: "info" | "error",
    offerToForget: boolean,
  ): void => {
    element.hidden = false;
    element.dataset["tone"] = tone;
    message.textContent = text;
    forget.hidden = !offerToForget;
  };

  return {
    element,
    showSaved: () => render("Kept for your next visit", "info", true),
    showFailure: (reason) => render(`Not kept: ${reason}`, "error", false),
    showNothing: () => {
      element.hidden = true;
    },
  };
}
