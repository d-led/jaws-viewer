/**
 * Makes `target` accept drops of files, folders and archives.
 *
 * The overlay is shown through drag events rather than CSS alone because browsers do not
 * let a page style `:hover` during a drag; `dragenter`/`dragleave` also fire for every
 * child element, so nesting is tracked with a counter.
 */
export function installDropTarget(options: {
  readonly target: HTMLElement;
  readonly overlay: HTMLElement;
  readonly onDrop: (transfer: DataTransfer) => void;
}): void {
  const { target, overlay, onDrop } = options;
  let depth = 0;

  const setActive = (active: boolean): void => {
    overlay.classList.toggle("is-active", active);
  };

  target.addEventListener("dragenter", (event) => {
    event.preventDefault();
    depth += 1;
    setActive(true);
  });

  target.addEventListener("dragover", (event) => {
    // Without this the browser refuses the drop and opens the file instead.
    event.preventDefault();
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "copy";
  });

  target.addEventListener("dragleave", () => {
    depth = Math.max(depth - 1, 0);
    if (depth === 0) setActive(false);
  });

  target.addEventListener("drop", (event) => {
    event.preventDefault();
    depth = 0;
    setActive(false);
    if (event.dataTransfer !== null) onDrop(event.dataTransfer);
  });

  // A drop anywhere else would navigate away from the viewer and lose the session.
  for (const type of ["dragover", "drop"] as const) {
    window.addEventListener(type, (event) => event.preventDefault());
  }
}
