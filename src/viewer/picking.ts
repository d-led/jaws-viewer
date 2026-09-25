import { Raycaster, Vector2, Vector3, type Camera, type Mesh } from "three";
import type { ScreenPoint } from "./viewport";

/** The size the canvas is drawn at, which is what a press is measured against. */
export interface CanvasSize {
  readonly width: number;
  readonly height: number;
}

export interface SurfacePickRequest {
  readonly camera: Camera;
  /** Every layer, whether or not it is on screen: what is hidden is not what anyone points at. */
  readonly surfaces: readonly Mesh[];
  /** The press, in pixels from the top left corner of the canvas. */
  readonly point: ScreenPoint;
  readonly size: CanvasSize;
}

/** The point on the model a press lands on, or nothing when it lands past every layer. */
export function pickedPoint(request: SurfacePickRequest): Vector3 | null {
  const { camera, surfaces, point, size } = request;
  if (size.width === 0 || size.height === 0) return null;

  const raycaster = new Raycaster();
  raycaster.setFromCamera(
    new Vector2(
      (point.x / size.width) * 2 - 1,
      -(point.y / size.height) * 2 + 1,
    ),
    camera,
  );

  // Three does not skip a hidden mesh on its own, and a layer that is not on screen is not what
  // anyone is pointing at. Hits come back sorted, so the first one is the nearest.
  const [nearest] = raycaster.intersectObjects(
    surfaces.filter((surface) => surface.visible),
    false,
  );

  return nearest === undefined ? null : nearest.point;
}
