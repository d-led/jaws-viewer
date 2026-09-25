import { Quaternion, Vector3, type Camera } from "three";

/** A full turn, which is what a drag across the height of the canvas is. */
const TWO_PI = Math.PI * 2;

/** How near the up axis the camera may be taken before which way is up stops being clear. */
const UP_TOLERANCE = 0.001;

/** How far a drag turns the camera. */
export interface OrbitTurn {
  /** About the up axis: what a sideways drag does. */
  readonly yaw: number;
  /** About the camera's own horizontal axis: what dragging up and down does. */
  readonly pitch: number;
}

/**
 * How far a drag turns the camera.
 *
 * At the rate a drag has always turned the view here: a drag across the height of the canvas is a
 * half turn, and no smaller a one on a canvas measured as nought.
 */
export function turnFor(
  drag: { readonly x: number; readonly y: number },
  height: number,
): OrbitTurn {
  const rate = TWO_PI / Math.max(height, 1);

  return { yaw: -rate * drag.x, pitch: -rate * drag.y };
}

/**
 * Turns the camera about `centre`, as a rigid body: where it stands turns, and so does the way it
 * looks.
 *
 * Turning the camera rather than moving what it looks at is the whole point: the centre is the
 * user's to set, and setting it must move nothing, so the camera keeps looking at whatever it was
 * looking at, and the centre is a point in the room that `OrbitControls` is never told about.
 */
export function turnAbout(
  camera: Camera,
  centre: Vector3,
  turn: OrbitTurn,
): void {
  const up = camera.up.clone().normalize();
  const offset = camera.position.clone().sub(centre);
  const radius = offset.length();
  const height = offset.dot(up);
  // Everything about the offset except how far along the up axis it sits, which is the direction the
  // pitch swings it in and out of.
  const level = offset.clone().addScaledVector(up, -height);
  if (radius === 0 || level.lengthSq() === 0) return;
  const inPlane = level.clone().normalize();

  // Up or down first, as an exact change of the angle between the camera and the up axis.
  const pitchAxis = new Vector3().crossVectors(up, inPlane).normalize();
  const from = Math.acos(clamp(height / radius, -1, 1));
  const to = clamp(from + turn.pitch, UP_TOLERANCE, Math.PI - UP_TOLERANCE);
  offset
    .copy(inPlane)
    .multiplyScalar(radius * Math.sin(to))
    .addScaledVector(up, radius * Math.cos(to));

  // Then sideways, about the up axis, which leaves how far above the centre the camera is alone.
  offset.applyAxisAngle(up, turn.yaw);

  const pitch = new Quaternion().setFromAxisAngle(pitchAxis, to - from);
  const yaw = new Quaternion().setFromAxisAngle(up, turn.yaw);

  camera.position.copy(centre).add(offset);
  camera.quaternion.premultiply(pitch).premultiply(yaw);
  camera.updateMatrixWorld();
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
