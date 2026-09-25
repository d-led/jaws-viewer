import { Box3, type Object3D, Vector3 } from "three";
import type { StandardView } from "./viewport";

/** The grid is built once at this size and scaled to whatever is loaded. */
export const GRID_EXTENT_MM = 400;

/** Extra room left around the model when framing, as a multiple of the tight fit. */
const FRAME_MARGIN = 1.15;

/** Nothing is framed tighter than this, so a lone triangle does not fill the window. */
const MIN_FRAME_EXTENT = 1;

/** Scan space is Z-up, the convention intraoral and CAD exports share. */
const VIEW_DIRECTIONS: Record<StandardView, readonly [number, number, number]> =
  {
    top: [0, 0, 1],
    bottom: [0, 0, -1],
    front: [0, -1, 0],
    back: [0, 1, 0],
    right: [1, 0, 0],
    left: [-1, 0, 0],
  };

/**
 * The two views that look along the up axis.
 *
 * "Up" is what stops the camera rolling about its own line of sight, so a view straight down that
 * axis has to name another one — there is no up-most direction left to take.
 */
const PLAN_VIEWS: ReadonlySet<StandardView> = new Set(["top", "bottom"]);
const PLAN_VIEW_UP: readonly [number, number, number] = [0, 1, 0];
const SCAN_UP: readonly [number, number, number] = [0, 0, 1];

/** The view a freshly loaded bundle opens in: from the front, slightly above. */
export const DEFAULT_DIRECTION = new Vector3(0, -1, 0.35).normalize();

/** What the camera looks along, and which way is up for it. */
export interface CameraPose {
  readonly direction: Vector3;
  readonly up: Vector3;
}

/** Where to look from for one of the axis views. */
export function poseFor(view: StandardView): CameraPose {
  const [x, y, z] = VIEW_DIRECTIONS[view];
  const up = PLAN_VIEWS.has(view) ? PLAN_VIEW_UP : SCAN_UP;

  return { direction: new Vector3(x, y, z), up: new Vector3(...up) };
}

/** How close and how far the camera may be taken, for the size of what is loaded. */
export interface ZoomLimits {
  readonly minDistance: number;
  readonly maxDistance: number;
}

export function zoomLimitsFor(bounds: Box3): ZoomLimits {
  return limitsFor(extentOf(bounds));
}

export interface FramingRequest {
  readonly bounds: Box3;
  /** Vertical field of view, in degrees. */
  readonly fov: number;
  readonly aspect: number;
  readonly direction: Vector3;
}

/** Where the camera goes to take in `bounds` from `direction`, and how far it may then move. */
export interface Framing extends ZoomLimits {
  readonly position: Vector3;
  readonly target: Vector3;
  readonly near: number;
  readonly far: number;
}

export function framingFor(request: FramingRequest): Framing {
  const { bounds, fov, aspect, direction } = request;
  const extent = extentOf(bounds);
  const centre = bounds.getCenter(new Vector3());
  const fitHeight = extent / 2 / Math.tan((fov * Math.PI) / 360);
  const fitWidth = fitHeight / Math.max(aspect, 0.1);
  // Far enough back that the model fits across either side of the window, whichever is tighter.
  const distance = FRAME_MARGIN * Math.max(fitHeight, fitWidth);

  return {
    position: centre
      .clone()
      .addScaledVector(direction.clone().normalize(), distance),
    target: centre,
    near: Math.max(distance / 100, 0.01),
    far: distance * 100,
    ...limitsFor(extent),
  };
}

/** How much of the floor grid to show under `bounds`, and where to put it. */
export interface GridPlacement {
  readonly scale: number;
  readonly position: Vector3;
}

export function gridPlacementFor(bounds: Box3): GridPlacement {
  const size = bounds.getSize(new Vector3());
  const centre = bounds.getCenter(new Vector3());
  // The grid covers the footprint, not the height: it is the floor the parts are lifted off.
  const footprint = Math.max(size.x, size.y, MIN_FRAME_EXTENT);

  return {
    scale: footprint / GRID_EXTENT_MM,
    position: new Vector3(centre.x, centre.y, bounds.min.z),
  };
}

/** The size a view is drawn at. */
export interface ViewSize {
  readonly width: number;
  readonly height: number;
  /** Width over height, which is what the camera's projection is built from. */
  readonly aspect: number;
}

/**
 * The size to draw at, or nothing when there is nothing to do.
 *
 * Resizing reallocates the drawing buffer, so the size it is already drawn at is left alone; a
 * hidden canvas measures zero, which is not a size to draw at either.
 */
export interface ResizeRequest {
  readonly width: number;
  readonly height: number;
  readonly previous: ViewSize | null;
}

export function resizeFor(request: ResizeRequest): ViewSize | null {
  const { width, height, previous } = request;
  if (width === 0 || height === 0) return null;
  if (isSameSize(previous, width, height)) return null;

  return { width, height, aspect: width / height };
}

function isSameSize(
  previous: ViewSize | null,
  width: number,
  height: number,
): boolean {
  return (
    previous !== null && previous.width === width && previous.height === height
  );
}

/** The box around what is on screen, or nothing when nothing is on screen. */
export function visibleBoundsOf(objects: Iterable<Object3D>): Box3 | null {
  const box = new Box3();
  for (const object of objects) {
    if (object.visible) box.expandByObject(object);
  }
  return box.isEmpty() ? null : box;
}

/** The size of `bounds` across whichever axis it spans most, which is what a view is framed by. */
export function extentOf(bounds: Box3): number {
  const size = bounds.getSize(new Vector3());
  return Math.max(size.x, size.y, size.z, MIN_FRAME_EXTENT);
}

function limitsFor(extent: number): ZoomLimits {
  return { minDistance: extent / 100, maxDistance: extent * 100 };
}
