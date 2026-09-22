/**
 * Two fingers scroll the page, one finger belongs to the model.
 *
 * The browser cannot scroll from a two-finger drag on a touch screen, so it is done here: the
 * movement of the two fingers' midpoint is turned into a scroll. Panning the model is stood
 * down while two fingers are down, so the two never fight — but zooming is left alone, because
 * a pinch barely moves the midpoint and losing pinch-zoom would be a poor trade.
 */
export interface ModelGestures {
  /** Called with `false` while two fingers are down, and `true` once they lift. */
  setPanning(enabled: boolean): void;
}

/** The average height of the fingers, which is what the page follows. */
function midpointY(touches: TouchList): number {
  let total = 0;
  for (const touch of Array.from(touches)) total += touch.clientY;
  return total / Math.max(touches.length, 1);
}

export function installTwoFingerScroll(
  canvas: HTMLCanvasElement,
  gestures: ModelGestures,
): void {
  let lastMidpointY: number | null = null;

  canvas.addEventListener("touchstart", (event) => {
    if (event.touches.length < 2) return;

    lastMidpointY = midpointY(event.touches);
    gestures.setPanning(false);
  });

  canvas.addEventListener("touchmove", (event) => {
    if (event.touches.length < 2 || lastMidpointY === null) return;

    const y = midpointY(event.touches);
    window.scrollBy(0, lastMidpointY - y);
    lastMidpointY = y;
  });

  const release = (event: TouchEvent): void => {
    if (event.touches.length >= 2) return;

    lastMidpointY = null;
    gestures.setPanning(true);
  };

  canvas.addEventListener("touchend", release);
  canvas.addEventListener("touchcancel", release);
}
