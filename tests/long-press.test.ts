// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOLD_MS, installLongPress } from "../src/viewer/long-press";

/** A press as the handler reads it, whichever device it came from. */
interface Press {
  readonly clientX: number;
  readonly clientY: number;
  readonly pointerId?: number;
  readonly isPrimary?: boolean;
  readonly button?: number;
}

/**
 * A pointer event carrying only what the handler reads. Real `PointerEvent`s are not constructible
 * everywhere, and where the pointer is, which pointer it is and which button went down are the whole
 * contract here.
 */
function pressed(type: string, press: Press): Event {
  const event = new Event(type);
  Object.defineProperty(event, "clientX", { value: press.clientX });
  Object.defineProperty(event, "clientY", { value: press.clientY });
  Object.defineProperty(event, "pointerId", { value: press.pointerId ?? 1 });
  Object.defineProperty(event, "isPrimary", { value: press.isPrimary ?? true });
  Object.defineProperty(event, "button", { value: press.button ?? 0 });
  return event;
}

const ON_THE_MODEL = { clientX: 120, clientY: 80 };
/** Where the model is told the pointer was held. */
const HELD_AT = { x: 120, y: 80 };

function setup() {
  const canvas = document.createElement("canvas");
  const onLongPress = vi.fn();

  installLongPress(canvas, { onLongPress });
  return { canvas, onLongPress };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a pointer held on the model", () => {
  it("reports where it was held, once the hold is up", () => {
    const { canvas, onLongPress } = setup();

    canvas.dispatchEvent(pressed("pointerdown", ON_THE_MODEL));
    vi.advanceTimersByTime(HOLD_MS);

    expect(onLongPress).toHaveBeenCalledWith(HELD_AT);
  });

  it("says nothing about a pointer that is let go again", () => {
    const { canvas, onLongPress } = setup();

    canvas.dispatchEvent(pressed("pointerdown", ON_THE_MODEL));
    vi.advanceTimersByTime(HOLD_MS - 1);
    window.dispatchEvent(pressed("pointerup", ON_THE_MODEL));
    vi.advanceTimersByTime(HOLD_MS);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("takes a drag for an orbit rather than a hold", () => {
    const { canvas, onLongPress } = setup();

    canvas.dispatchEvent(pressed("pointerdown", ON_THE_MODEL));
    window.dispatchEvent(
      pressed("pointermove", { clientX: 120, clientY: 120 }),
    );
    vi.advanceTimersByTime(HOLD_MS);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("puts up with the small wander of a pointer being held as still as one can be", () => {
    const { canvas, onLongPress } = setup();

    canvas.dispatchEvent(pressed("pointerdown", ON_THE_MODEL));
    window.dispatchEvent(pressed("pointermove", { clientX: 123, clientY: 78 }));
    vi.advanceTimersByTime(HOLD_MS);

    expect(onLongPress).toHaveBeenCalledWith(HELD_AT);
  });

  it("stands down once a second finger lands, which is the page's gesture", () => {
    const { canvas, onLongPress } = setup();

    canvas.dispatchEvent(pressed("pointerdown", ON_THE_MODEL));
    canvas.dispatchEvent(
      pressed("pointerdown", { clientX: 180, clientY: 80, isPrimary: false }),
    );
    vi.advanceTimersByTime(HOLD_MS);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("leaves the other buttons alone, which are how a mouse pans and opens its menu", () => {
    const { canvas, onLongPress } = setup();

    canvas.dispatchEvent(
      pressed("pointerdown", { ...ON_THE_MODEL, button: 2 }),
    );
    vi.advanceTimersByTime(HOLD_MS);

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("reports a hold once, however long the pointer stays down", () => {
    const { canvas, onLongPress } = setup();

    canvas.dispatchEvent(pressed("pointerdown", ON_THE_MODEL));
    vi.advanceTimersByTime(HOLD_MS * 4);

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("reports the press after it as well", () => {
    const { canvas, onLongPress } = setup();

    canvas.dispatchEvent(pressed("pointerdown", ON_THE_MODEL));
    vi.advanceTimersByTime(HOLD_MS);
    window.dispatchEvent(pressed("pointerup", ON_THE_MODEL));

    const elsewhere = { clientX: 40, clientY: 20 };
    canvas.dispatchEvent(pressed("pointerdown", elsewhere));
    vi.advanceTimersByTime(HOLD_MS);

    expect(onLongPress.mock.calls).toEqual([[HELD_AT], [{ x: 40, y: 20 }]]);
  });

  it("says nothing when the browser takes the pointer away", () => {
    const { canvas, onLongPress } = setup();

    canvas.dispatchEvent(pressed("pointerdown", ON_THE_MODEL));
    window.dispatchEvent(pressed("pointercancel", ON_THE_MODEL));
    vi.advanceTimersByTime(HOLD_MS);

    expect(onLongPress).not.toHaveBeenCalled();
  });
});
