import type { ScreenPoint } from "./viewport";

/**
 * How long a pointer has to stay put to be a hold rather than the start of a drag.
 *
 * Long enough that setting a finger down for an orbit does not trip it, short enough that waiting
 * for it does not feel like waiting.
 */
export const HOLD_MS = 500;

/** How far a held pointer may wander and still count as held in one place. */
const WANDER_TOLERANCE_PX = 12;

export interface LongPressHandlers {
  /** A pointer held on the canvas, at the place it was put down. */
  onLongPress(point: ScreenPoint): void;
}

/**
 * Reports a pointer held on one spot, whether that is a finger, a pen or a mouse.
 *
 * A hold has to be told apart from everything else a pointer does here: a drag orbits, two fingers
 * scroll the page, a right-press is how a mouse pans, and a quick click is nothing at all. So the
 * timer is dropped when the pointer wanders past a small tolerance, when another pointer or another
 * button arrives, and when the pointer is taken away — and a hold that has been reported is not
 * reported again until the pointer is up.
 */
export function installLongPress(
  canvas: HTMLCanvasElement,
  handlers: LongPressHandlers,
): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let holding: {
    readonly pointerId: number;
    readonly point: ScreenPoint;
  } | null = null;

  const forget = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    holding = null;
  };

  canvas.addEventListener("pointerdown", (event) => {
    // One pointer and the primary button: a second finger means the page is being scrolled, and the
    // other buttons are how a mouse pans and how its menu is opened.
    if (holding !== null || !event.isPrimary || event.button !== 0) {
      forget();
      return;
    }

    const point: ScreenPoint = { x: event.clientX, y: event.clientY };
    holding = { pointerId: event.pointerId, point };
    timer = setTimeout(() => {
      timer = null;
      handlers.onLongPress(point);
    }, HOLD_MS);
  });

  // The pointer is followed on the window: a press that is dragged off the canvas is a drag, and
  // has to be judged by where it went.
  window.addEventListener("pointermove", (event) => {
    if (holding === null || event.pointerId !== holding.pointerId) return;
    if (wanderedFrom(holding.point, event)) forget();
  });

  // Whatever takes the pointer away takes the hold with it.
  window.addEventListener("pointerup", forget);
  window.addEventListener("pointercancel", forget);
}

/** Whether a held pointer has been taken far enough to have been doing something else. */
function wanderedFrom(from: ScreenPoint, event: PointerEvent): boolean {
  return (
    Math.hypot(event.clientX - from.x, event.clientY - from.y) >
    WANDER_TOLERANCE_PX
  );
}
