import { icon, type IconName } from "./icons";

export interface ElementSpec {
  readonly class?: string;
  /** Set as text, never as markup. */
  readonly text?: string;
  readonly title?: string;
  readonly attrs?: Readonly<Record<string, string>>;
  readonly on?: Readonly<Record<string, EventListener>>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  spec: ElementSpec = {},
  children: readonly (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (spec.class !== undefined) element.className = spec.class;
  if (spec.text !== undefined) element.textContent = spec.text;
  if (spec.title !== undefined) element.title = spec.title;
  for (const [name, value] of Object.entries(spec.attrs ?? {})) {
    element.setAttribute(name, value);
  }
  for (const [event, listener] of Object.entries(spec.on ?? {})) {
    element.addEventListener(event, listener);
  }
  element.append(...children);
  return element;
}

/** A labelled checkbox, wired to `onChange` with the current checked state. */
export function checkbox(options: {
  readonly label: string;
  readonly title?: string;
  readonly checked?: boolean;
  readonly class?: string;
  readonly onChange: (checked: boolean) => void;
}): HTMLElement {
  const input = el("input", {
    attrs: {
      type: "checkbox",
      ...(options.checked === true ? { checked: "checked" } : {}),
    },
    on: { change: (event) => options.onChange(isChecked(event)) },
  });
  if (options.title !== undefined) input.title = options.title;

  return el("label", { class: namespaced("checkbox", options.class) }, [
    input,
    el("span", { text: options.label }),
  ]);
}

function namespaced(base: string, extra: string | undefined): string {
  return extra === undefined ? base : `${base} ${extra}`;
}

export function isChecked(event: Event): boolean {
  return event.target instanceof HTMLInputElement && event.target.checked;
}

export function inputValue(event: Event): string {
  return event.target instanceof HTMLInputElement ? event.target.value : "";
}

/**
 * Runs `action` on click, guarding against unhandled rejections.
 *
 * A label alone is not a hover hint on a button as compact as these, so one is always set: the
 * caller's own wording where it has something more to say, and the label otherwise.
 */
export function button(
  label: string,
  action: () => void | Promise<void>,
  spec: ElementSpec = {},
): HTMLButtonElement {
  return el("button", {
    ...spec,
    class: spec.class ?? "button",
    text: label,
    title: spec.title ?? label,
    attrs: { type: "button", ...spec.attrs },
    on: { click: () => void action(), ...spec.on },
  });
}

/**
 * A button that is only an icon.
 *
 * There is no visible text to name it, so `label` becomes both the tooltip and the accessible
 * name — which is also how a test finds it.
 */
export function iconButton(
  name: IconName,
  label: string,
  action: () => void,
  spec: ElementSpec = {},
): HTMLButtonElement {
  const element = el("button", {
    ...spec,
    class: spec.class ?? "button button--icon",
    // The label is what a screen reader reads; the tooltip may say more.
    title: spec.title ?? label,
    attrs: { type: "button", "aria-label": label, ...spec.attrs },
    on: { click: () => action(), ...spec.on },
  });
  element.append(icon(name));
  return element;
}
