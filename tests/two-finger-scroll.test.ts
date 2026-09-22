// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installTwoFingerScroll } from "../src/viewer/two-finger-scroll";

/**
 * A touch event carrying only what the handler reads. Real `TouchEvent`s are not constructible
 * everywhere, and the finger heights are the whole contract here.
 */
function touches(type: string, clientYs: readonly number[]): Event {
  const event = new Event(type);
  Object.defineProperty(event, "touches", {
    value: clientYs.map((clientY) => ({ clientY })),
  });
  return event;
}

function setup() {
  const canvas = document.createElement("canvas");
  const setPanning = vi.fn();
  const scrollBy = vi
    .spyOn(window, "scrollBy")
    .mockImplementation(() => undefined);

  installTwoFingerScroll(canvas, { setPanning });
  return { canvas, setPanning, scrollBy };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("two fingers scrolling the page", () => {
  it("scrolls by however far the fingers moved together", () => {
    const { canvas, scrollBy } = setup();

    canvas.dispatchEvent(touches("touchstart", [100, 140]));
    canvas.dispatchEvent(touches("touchmove", [80, 120]));

    // Midpoint went from 120 to 100, so the page follows the fingers up by 20.
    expect(scrollBy).toHaveBeenCalledWith(0, 20);
  });

  it("keeps scrolling as the fingers keep moving", () => {
    const { canvas, scrollBy } = setup();

    canvas.dispatchEvent(touches("touchstart", [100, 100]));
    canvas.dispatchEvent(touches("touchmove", [90, 90]));
    canvas.dispatchEvent(touches("touchmove", [70, 70]));

    expect(scrollBy.mock.calls).toEqual([
      [0, 10],
      [0, 20],
    ]);
  });

  it("stands the model\u2019s panning down while two fingers are down, and back up after", () => {
    const { canvas, setPanning } = setup();

    canvas.dispatchEvent(touches("touchstart", [100, 140]));
    expect(setPanning).toHaveBeenLastCalledWith(false);

    canvas.dispatchEvent(touches("touchend", [140]));
    expect(setPanning).toHaveBeenLastCalledWith(true);
  });

  it("leaves one finger entirely to the model", () => {
    const { canvas, setPanning, scrollBy } = setup();

    canvas.dispatchEvent(touches("touchstart", [100]));
    canvas.dispatchEvent(touches("touchmove", [40]));

    expect(setPanning).not.toHaveBeenCalled();
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("does not scroll before two fingers have landed", () => {
    const { canvas, scrollBy } = setup();

    canvas.dispatchEvent(touches("touchmove", [10, 20]));

    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("forgets the gesture once the fingers lift", () => {
    const { canvas, scrollBy } = setup();

    canvas.dispatchEvent(touches("touchstart", [100, 120]));
    canvas.dispatchEvent(touches("touchend", []));
    canvas.dispatchEvent(touches("touchmove", [10, 20]));

    expect(scrollBy).not.toHaveBeenCalled();
  });
});
