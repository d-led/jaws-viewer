import { Object3D } from "three";
import { describe, expect, it } from "vitest";
import {
  createStatsWindow,
  visibleTrianglesOf,
} from "../src/viewer/viewport-stats";

/** A frame's worth of work as the renderer would report it. */
const WORK = { visibleTriangles: 120, drawCalls: 3 };

/** A layer as a frame sees it: a mesh that may or may not be drawn, and what it holds. */
function drawn(visible: boolean, triangles: number) {
  const mesh = new Object3D();
  mesh.visible = visible;
  return { mesh, triangles };
}

describe("reading out the frame rate", () => {
  it("says nothing until an interval has gone by", () => {
    const window = createStatsWindow(1);

    expect(window.add(0.4, () => WORK)).toBeNull();
    expect(window.add(0.4, () => WORK)).toBeNull();
  });

  it("reports the frames of the whole interval, not the one it was closed by", () => {
    const window = createStatsWindow(0.6);

    // A slow first frame and a quick second: a reading off the last frame alone would say 5 fps.
    window.add(0.4, () => WORK);
    const stats = window.add(0.2, () => WORK);

    expect(stats?.fps).toBe(3);
  });

  it("hands over what the renderer was drawing, read at the moment it is due", () => {
    const window = createStatsWindow(0.5);

    const stats = window.add(0.5, () => WORK);

    expect(stats).toEqual({ fps: 2, ...WORK });
  });

  it("leaves the renderer alone until a reading is due", () => {
    const window = createStatsWindow(1);
    let asked = 0;

    window.add(0.2, () => {
      asked += 1;
      return WORK;
    });
    expect(asked).toBe(0);

    window.add(0.9, () => {
      asked += 1;
      return WORK;
    });
    expect(asked).toBe(1);
  });

  it("starts counting a fresh interval after a reading", () => {
    const window = createStatsWindow(1);
    window.add(1, () => WORK);

    expect(window.add(0.5, () => WORK)).toBeNull();
    expect(window.add(0.5, () => WORK)).not.toBeNull();
  });
});

describe("counting what is drawn", () => {
  it("counts only the layers the renderer is showing", () => {
    const layers = [drawn(true, 100), drawn(false, 50), drawn(true, 25)];

    expect(visibleTrianglesOf(layers)).toBe(125);
  });

  it("counts nothing when nothing is shown", () => {
    expect(visibleTrianglesOf([drawn(false, 100)])).toBe(0);
    expect(visibleTrianglesOf([])).toBe(0);
  });
});
