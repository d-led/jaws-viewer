/**
 * One pointer dragging the canvas turns the camera, which is the one gesture `OrbitControls` is not
 * left to do here: it turns about what it looks at, and this viewer turns about the point the user
 * set — see `orbit.ts`.
 */
export interface OrbitDragHandlers {
  /** How far the pointer has dragged since the last report, in pixels. */
  onTurn(drag: { readonly x: number; readonly y: number }): void;
  /** The drag is over — call it a turn, and whatever it changed is worth remembering. */
  onEnd(): void;
}

/**
 * Reports a pointer dragged across the canvas.
 *
 * One pointer, and its primary button: a second finger is the page's gesture, and the other mouse
 * buttons are how the model is panned and the browser's menu is opened. A drag that loses its
 * pointer — to a second finger, say — is over rather than resumed, and a drag that has turned
 * nothing says so rather than announcing a turn nobody made.
 */
export function installOrbitDrag(
  canvas: HTMLCanvasElement,
  handlers: OrbitDragHandlers,
): void {
  let dragging: { readonly pointerId: number; x: number; y: number } | null =
    null;
  let turned = false;

  canvas.addEventListener("pointerdown", (event) => {
    // A second finger is the page's gesture, and it ends whatever drag was under way; the other mouse
    // buttons are the pan and the browser's own menu.
    if (!event.isPrimary || event.button !== 0) {
      dragging = null;
      return;
    }
    if (dragging !== null) return;

    dragging = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  });

  canvas.addEventListener("pointermove", (event) => {
    if (dragging === null || event.pointerId !== dragging.pointerId) return;

    const drag = {
      x: event.clientX - dragging.x,
      y: event.clientY - dragging.y,
    };
    dragging = { ...dragging, x: event.clientX, y: event.clientY };

    if (drag.x === 0 && drag.y === 0) return;
    turned = true;
    handlers.onTurn(drag);
  });

  const release = (event: PointerEvent): void => {
    if (dragging === null || event.pointerId !== dragging.pointerId) return;

    dragging = null;
    if (turned) handlers.onEnd();
    turned = false;
  };

  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
}
