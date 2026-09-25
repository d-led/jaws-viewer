// @vitest-environment happy-dom
import { PerspectiveCamera, Vector3 } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { describe, expect, it } from "vitest";
import { turnAbout, turnFor } from "../src/viewer/orbit";

/** A full turn, as a drag is measured in. */
const TWO_PI = Math.PI * 2;

/** How far off the camera's line of sight the centre is, in radians: its place on the screen. */
function bearing(camera: PerspectiveCamera, centre: Vector3): number {
  const looking = camera.getWorldDirection(new Vector3());
  const towardsCentre = centre.clone().sub(camera.position).normalize();

  return Math.acos(Math.min(Math.max(looking.dot(towardsCentre), -1), 1));
}

/** A camera looking at the origin from the front, slightly above, as a load frames it. */
function framedCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(45, 1, 0.1, 10_000);
  camera.up.set(0, 0, 1);
  camera.position.set(0, -100, 35);
  camera.lookAt(0, 0, 0);
  return camera;
}

const MIDDLE = new Vector3(0, 0, 0);
/** Off to one side and lower down, as a tooth or a preparation die would be. */
const OFF_TO_ONE_SIDE = new Vector3(12, 0, -4);

describe("how far a drag turns the camera", () => {
  it("is a full turn for a drag across the height of the canvas", () => {
    expect(Math.abs(turnFor({ x: 0, y: 600 }, 600).pitch)).toBeCloseTo(
      TWO_PI,
      9,
    );
    expect(Math.abs(turnFor({ x: 600, y: 0 }, 600).yaw)).toBeCloseTo(TWO_PI, 9);
  });

  it("turns a longer canvas less for the same drag, so the model keeps pace with the pointer", () => {
    expect(Math.abs(turnFor({ x: 100, y: 0 }, 1000).yaw)).toBeLessThan(
      Math.abs(turnFor({ x: 100, y: 0 }, 500).yaw),
    );
  });

  it("turns nowhere at all for a drag that went nowhere", () => {
    const turn = turnFor({ x: 0, y: 0 }, 600);

    expect(Math.abs(turn.yaw)).toBe(0);
    expect(Math.abs(turn.pitch)).toBe(0);
  });

  it("has something to say about a canvas with no height yet", () => {
    expect(Number.isFinite(turnFor({ x: 10, y: 10 }, 0).yaw)).toBe(true);
  });
});

describe("turning about the orbit centre", () => {
  it("leaves the centre exactly where it was on the screen", () => {
    const camera = framedCamera();
    const before = bearing(camera, OFF_TO_ONE_SIDE);

    turnAbout(camera, OFF_TO_ONE_SIDE, { yaw: 0.4, pitch: 0.2 });

    // What the camera turns about does not move across the screen: everything else swings around it,
    // which is what makes it the centre.
    expect(bearing(camera, OFF_TO_ONE_SIDE)).toBeCloseTo(before, 9);
  });

  it("keeps the camera the same distance from it", () => {
    const camera = framedCamera();
    const before = camera.position.distanceTo(OFF_TO_ONE_SIDE);

    turnAbout(camera, OFF_TO_ONE_SIDE, { yaw: 1.1, pitch: -0.3 });

    expect(camera.position.distanceTo(OFF_TO_ONE_SIDE)).toBeCloseTo(before, 9);
  });

  it("turns the camera about the centre rather than about what it looks at", () => {
    const camera = framedCamera();
    const looked = camera.getWorldDirection(new Vector3());

    turnAbout(camera, OFF_TO_ONE_SIDE, { yaw: 0.5, pitch: 0 });

    // The camera looks somewhere else now, by the same amount it turned: it is a rigid turn, not a
    // re-aim at the centre.
    const looking = camera.getWorldDirection(new Vector3());
    expect(looking.angleTo(looked)).toBeGreaterThan(0.4);
  });

  it("takes the camera round the centre the way it was turned", () => {
    const sideways = framedCamera();
    turnAbout(sideways, MIDDLE, { yaw: 0.3, pitch: 0 });
    expect(sideways.position.x).toBeGreaterThan(1);

    // A pitch is the change in how far up, from the centre, the camera stands: a negative one lifts
    // it, which is what dragging downwards does.
    const upwards = framedCamera();
    const before = upwards.position.z;
    turnAbout(upwards, MIDDLE, { yaw: 0, pitch: -0.3 });
    expect(upwards.position.z).toBeGreaterThan(before);
  });

  it("never quite takes the camera over the axis it calls up", () => {
    const camera = framedCamera();

    // Far more than enough of a yank upwards to go right over the top.
    turnAbout(camera, MIDDLE, { yaw: 0, pitch: -100 });

    const offset = camera.position.clone().sub(MIDDLE).normalize();
    expect(offset.angleTo(new Vector3(0, 0, 1))).toBeGreaterThan(0.0005);
    expect(Number.isFinite(camera.position.length())).toBe(true);
  });

  it("does nothing it cannot do, rather than something at random", () => {
    const camera = framedCamera();
    const stood = camera.position.clone();
    // The camera standing on the centre it is asked to turn about.
    camera.position.copy(MIDDLE);

    turnAbout(camera, MIDDLE, { yaw: 0.4, pitch: 0.4 });

    expect(camera.position.toArray()).toEqual(MIDDLE.toArray());
    expect(stood.length()).toBeGreaterThan(0);
  });
});

/**
 * The turn has to feel the way it always has, and the way it always has is `OrbitControls`' — whose
 * `rotateLeft`/`rotateUp` are what a drag used to be handed to. With the centre where that camera
 * looks, the two have to agree exactly.
 */
describe("the turn against the one `OrbitControls` makes", () => {
  const HEIGHT = 600;

  function orbitControlsTurning(
    turn: { readonly left: number; readonly up: number },
    centre: Vector3,
  ): PerspectiveCamera {
    const camera = framedCamera();
    const canvas = document.createElement("canvas");
    Object.defineProperty(canvas, "clientHeight", { value: HEIGHT });

    const controls = new OrbitControls(camera, canvas);
    controls.target.copy(centre);
    controls.rotateLeft(turn.left);
    controls.rotateUp(turn.up);

    return camera;
  }

  it("turns as far to the left, for a drag to the right", () => {
    const drag = { x: 120, y: 0 };
    const theirs = orbitControlsTurning(
      { left: (TWO_PI * drag.x) / HEIGHT, up: 0 },
      MIDDLE,
    );

    const ours = framedCamera();
    turnAbout(ours, MIDDLE, turnFor(drag, HEIGHT));

    expect(ours.position.distanceTo(theirs.position)).toBeLessThan(1e-9);
  });

  it("turns as far up, for a drag downwards", () => {
    const drag = { x: 0, y: 90 };
    const theirs = orbitControlsTurning(
      { left: 0, up: (TWO_PI * drag.y) / HEIGHT },
      MIDDLE,
    );

    const ours = framedCamera();
    turnAbout(ours, MIDDLE, turnFor(drag, HEIGHT));

    expect(ours.position.distanceTo(theirs.position)).toBeLessThan(1e-9);
  });
});
