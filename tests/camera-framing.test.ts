import { Box3, BoxGeometry, Mesh, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DIRECTION,
  framingFor,
  gridPlacementFor,
  poseFor,
  resizeFor,
  visibleBoundsOf,
  zoomLimitsFor,
} from "../src/viewer/camera-framing";

/** A box spanning `size` in every direction, centred on the origin. */
function centred(size: number): Box3 {
  const half = size / 2;
  return new Box3(
    new Vector3(-half, -half, -half),
    new Vector3(half, half, half),
  );
}

/** The distance the camera ends up from the middle of what it is looking at. */
function distanceOf(
  bounds: Box3,
  direction: Vector3 = DEFAULT_DIRECTION.clone(),
): number {
  const framing = framingFor({ bounds, fov: 45, aspect: 1, direction });
  return framing.position.distanceTo(framing.target);
}

/** A unit cube standing at `x`, so a box around it is not empty. */
function boxAt(x: number): Mesh {
  const cube = new Mesh(new BoxGeometry(1, 1, 1));
  cube.position.set(x, 0, 0);
  return cube;
}

describe("posing the camera for an axis view", () => {
  it("looks along the axis the view names, from the front and from above", () => {
    expect(poseFor("front").direction.toArray()).toEqual([0, -1, 0]);
    expect(poseFor("top").direction.toArray()).toEqual([0, 0, 1]);
  });

  it("keeps Z up for a view that is not along it", () => {
    expect(poseFor("front").up.toArray()).toEqual([0, 0, 1]);
    expect(poseFor("right").up.toArray()).toEqual([0, 0, 1]);
  });

  it("takes another up for the two views that look along Z, which would otherwise roll", () => {
    expect(poseFor("top").up.toArray()).toEqual([0, 1, 0]);
    expect(poseFor("bottom").up.toArray()).toEqual([0, 1, 0]);
    // Not parallel to the direction it is looking along, which is what "up" has to avoid.
    expect(
      Math.abs(poseFor("top").up.dot(poseFor("top").direction)),
    ).toBeLessThan(1e-6);
  });
});

describe("framing a box", () => {
  it("looks at the middle of it, from the direction it is given", () => {
    const bounds = new Box3(new Vector3(0, 0, 0), new Vector3(10, 10, 10));

    const framing = framingFor({
      bounds,
      fov: 45,
      aspect: 1,
      direction: new Vector3(0, -1, 0),
    });

    expect(framing.target.toArray()).toEqual([5, 5, 5]);
    expect(framing.position.y).toBeLessThan(5);
    expect(framing.position.x).toBeCloseTo(5, 6);
  });

  it("stands off far enough to leave room around the model", () => {
    expect(distanceOf(centred(10))).toBeGreaterThan(10);
  });

  it("frames a flat scan by what it spans, not by the height it does not have", () => {
    const flat = new Box3(new Vector3(-50, -5, 0), new Vector3(50, 5, 0));

    // A 100 mm arch that is paper thin is framed for its 100 mm, not for nothing at all.
    expect(distanceOf(flat)).toBeGreaterThan(100);
  });

  it("frames even a speck from far enough away to see it", () => {
    expect(distanceOf(centred(0.01))).toBeGreaterThan(1);
  });

  it("pulls further back for a narrower lens, which sees less", () => {
    const bounds = centred(10);
    const wide = framingFor({
      bounds,
      fov: 60,
      aspect: 1,
      direction: DEFAULT_DIRECTION.clone(),
    });
    const narrow = framingFor({
      bounds,
      fov: 30,
      aspect: 1,
      direction: DEFAULT_DIRECTION.clone(),
    });

    expect(narrow.position.distanceTo(narrow.target)).toBeGreaterThan(
      wide.position.distanceTo(wide.target),
    );
  });

  it("keeps the model inside the depth range the camera can draw", () => {
    const framing = framingFor({
      bounds: centred(10),
      fov: 45,
      aspect: 1,
      direction: DEFAULT_DIRECTION.clone(),
    });

    expect(framing.near).toBeGreaterThan(0);
    expect(framing.near).toBeLessThan(
      framing.position.distanceTo(framing.target),
    );
    expect(framing.far).toBeGreaterThan(
      framing.position.distanceTo(framing.target),
    );
  });
});

describe("how far the camera may then be moved", () => {
  it("lets a bigger model be pulled further back than a smaller one", () => {
    const small = zoomLimitsFor(centred(10));
    const large = zoomLimitsFor(centred(100));

    expect(small.maxDistance).toBeLessThan(large.maxDistance);
    expect(small.minDistance).toBeLessThan(small.maxDistance);
  });

  it("stops the camera being taken inside the model it is showing", () => {
    expect(zoomLimitsFor(centred(100)).minDistance).toBeGreaterThan(0);
  });
});

describe("placing the floor grid", () => {
  it("scales the grid to the footprint of what is standing on it", () => {
    const arch = new Box3(new Vector3(-100, -50, 0), new Vector3(100, 50, 20));

    // The grid is built 400 mm across, so a 200 mm arch covers half of it.
    expect(gridPlacementFor(arch).scale).toBeCloseTo(0.5, 6);
  });

  it("sits under the model, on the floor rather than through it", () => {
    const arch = new Box3(new Vector3(-100, -50, -8), new Vector3(100, 50, 20));

    expect(gridPlacementFor(arch).position.toArray()).toEqual([0, 0, -8]);
  });
});

describe("what the camera has to take in", () => {
  it("boxes what is on screen and leaves out what is not", () => {
    const hidden = boxAt(1000);
    hidden.visible = false;

    const bounds = visibleBoundsOf([boxAt(0), hidden]);

    expect(bounds?.max.x).toBeGreaterThan(0);
    expect(bounds?.max.x).toBeLessThan(1000);
  });

  it("has nothing to frame when nothing is on screen", () => {
    const hidden = boxAt(0);
    hidden.visible = false;

    expect(visibleBoundsOf([hidden])).toBeNull();
    expect(visibleBoundsOf([])).toBeNull();
  });
});

describe("resizing the view", () => {
  it("gives the camera the shape of the window it is drawn in", () => {
    const size = resizeFor({ width: 800, height: 400, previous: null });

    expect(size).toEqual({ width: 800, height: 400, aspect: 2 });
  });

  it("leaves a canvas the same size alone, because resizing reallocates what is drawn on", () => {
    const previous = { width: 800, height: 400, aspect: 2 };

    expect(resizeFor({ width: 800, height: 400, previous })).toBeNull();
  });

  it("leaves a hidden canvas alone, because a hidden canvas measures nothing", () => {
    expect(resizeFor({ width: 0, height: 0, previous: null })).toBeNull();
  });
});
