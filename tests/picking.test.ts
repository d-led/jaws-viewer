import {
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
} from "three";
import { describe, expect, it } from "vitest";
import { pickedPoint } from "../src/viewer/picking";

const CANVAS = { width: 200, height: 200 };
/** The middle of the canvas, which is where the camera's line of sight crosses it. */
const MIDDLE = { x: 100, y: 100 };

/** A camera standing back on +Z, looking at the origin. */
function cameraStandingBack(distance = 100): PerspectiveCamera {
  const camera = new PerspectiveCamera(45, 1, 0.1, 1000);
  camera.position.set(0, 0, distance);
  camera.lookAt(0, 0, 0);
  return camera;
}

/** A square facing the camera, standing at `z` in the scan space. */
function surfaceAt(z: number, size = 40): Mesh {
  const surface = new Mesh(
    new PlaneGeometry(size, size),
    new MeshBasicMaterial(),
  );
  surface.position.set(0, 0, z);
  surface.updateMatrixWorld();
  return surface;
}

function picked(
  surfaces: readonly Mesh[],
  point: { readonly x: number; readonly y: number } = MIDDLE,
) {
  return pickedPoint({
    camera: cameraStandingBack(),
    surfaces,
    point,
    size: CANVAS,
  });
}

describe("the point a press picks out of the model", () => {
  it("is the point the press found, right where it is on the model", () => {
    const surfaces = [surfaceAt(0, 60)];

    // The middle of the canvas is the middle of the surface the camera is looking at.
    expect(picked(surfaces)?.toArray()).toEqual([0, 0, 0]);

    // And a press well off to one side picks its own place on that surface, not the middle of it.
    const corner = picked(surfaces, { x: 170, y: 60 });
    expect(corner?.z).toBeCloseTo(0, 6);
    expect(corner?.x).toBeGreaterThan(10);
    expect(corner?.y).toBeGreaterThan(5);
  });

  it("is on the nearest surface when one layer stands in front of another", () => {
    // Added far first: what a press finds is what is in front of the camera, not what came first.
    expect(picked([surfaceAt(-20), surfaceAt(20)])?.toArray()).toEqual([
      0, 0, 20,
    ]);
  });

  it("is on nothing from a layer that is not on screen", () => {
    const hidden = surfaceAt(20);
    hidden.visible = false;

    expect(picked([hidden, surfaceAt(-20)])?.toArray()).toEqual([0, 0, -20]);
  });

  it("is nothing at all when the press lands past the model", () => {
    expect(picked([surfaceAt(0, 10)], { x: 10, y: 10 })).toBeNull();
  });

  it("is nothing when there is nothing on screen to press", () => {
    expect(picked([])).toBeNull();
  });
});
