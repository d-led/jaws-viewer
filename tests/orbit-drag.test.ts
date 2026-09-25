// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { installOrbitDrag } from "../src/viewer/orbit-drag";

/** A pointer event carrying only what the handler reads. */
function pressed(
  type: string,
  spec: {
    readonly x: number;
    readonly y: number;
    readonly pointerId?: number;
    readonly isPrimary?: boolean;
    readonly button?: number;
  },
): Event {
  const event = new Event(type);
  Object.defineProperty(event, "clientX", { value: spec.x });
  Object.defineProperty(event, "clientY", { value: spec.y });
  Object.defineProperty(event, "pointerId", { value: spec.pointerId ?? 1 });
  Object.defineProperty(event, "isPrimary", { value: spec.isPrimary ?? true });
  Object.defineProperty(event, "button", { value: spec.button ?? 0 });
  return event;
}

function setup() {
  const canvas = document.createElement("canvas");
  const onTurn = vi.fn();
  const onEnd = vi.fn();

  installOrbitDrag(canvas, { onTurn, onEnd });
  return { canvas, onTurn, onEnd };
}

/** A drag of `dx` across and `dy` down, reported the way a pointer reports it. */
function drag(
  canvas: HTMLCanvasElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
): void {
  canvas.dispatchEvent(pressed("pointerdown", from));
  canvas.dispatchEvent(pressed("pointermove", to));
  canvas.dispatchEvent(pressed("pointerup", to));
}

describe("dragging the model round", () => {
  it("reports the drag as it goes, in the pixels it has covered", () => {
    const { canvas, onTurn } = setup();

    canvas.dispatchEvent(pressed("pointerdown", { x: 100, y: 100 }));
    canvas.dispatchEvent(pressed("pointermove", { x: 130, y: 90 }));

    expect(onTurn).toHaveBeenCalledWith({ x: 30, y: -10 });
  });

  it("reports each step of a drag on from the last, not from where it started", () => {
    const { canvas, onTurn } = setup();

    canvas.dispatchEvent(pressed("pointerdown", { x: 100, y: 100 }));
    canvas.dispatchEvent(pressed("pointermove", { x: 120, y: 100 }));
    canvas.dispatchEvent(pressed("pointermove", { x: 150, y: 100 }));

    expect(onTurn.mock.calls).toEqual([[{ x: 20, y: 0 }], [{ x: 30, y: 0 }]]);
  });

  it("says the drag is over once it is over", () => {
    const { canvas, onEnd } = setup();

    drag(canvas, { x: 100, y: 100 }, { x: 140, y: 100 });

    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("says nothing about a press that never moved", () => {
    const { canvas, onTurn, onEnd } = setup();

    canvas.dispatchEvent(pressed("pointerdown", { x: 100, y: 100 }));
    canvas.dispatchEvent(pressed("pointerup", { x: 100, y: 100 }));

    // A click is not a turn, and there is nothing about it worth remembering.
    expect(onTurn).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("leaves the other buttons to the pan and the browser's menu", () => {
    const { canvas, onTurn } = setup();

    canvas.dispatchEvent(pressed("pointerdown", { x: 100, y: 100, button: 2 }));
    canvas.dispatchEvent(pressed("pointermove", { x: 140, y: 100 }));

    expect(onTurn).not.toHaveBeenCalled();
  });

  it("stands down once a second finger lands, which is the page's gesture", () => {
    const { canvas, onTurn } = setup();

    canvas.dispatchEvent(pressed("pointerdown", { x: 100, y: 100 }));
    canvas.dispatchEvent(
      pressed("pointerdown", {
        x: 200,
        y: 100,
        pointerId: 2,
        isPrimary: false,
      }),
    );
    canvas.dispatchEvent(pressed("pointermove", { x: 160, y: 100 }));

    expect(onTurn).not.toHaveBeenCalled();
  });

  it("does not pick the drag up again when the second finger leaves", () => {
    const { canvas, onTurn } = setup();

    canvas.dispatchEvent(pressed("pointerdown", { x: 100, y: 100 }));
    canvas.dispatchEvent(
      pressed("pointerdown", {
        x: 200,
        y: 100,
        pointerId: 2,
        isPrimary: false,
      }),
    );
    canvas.dispatchEvent(
      pressed("pointerup", { x: 200, y: 100, pointerId: 2, isPrimary: false }),
    );
    canvas.dispatchEvent(pressed("pointermove", { x: 150, y: 100 }));

    expect(onTurn).not.toHaveBeenCalled();
  });
});
