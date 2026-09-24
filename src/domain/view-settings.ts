import { CURVATURE_KINDS, type CurvatureKind } from "./curvature";

/** What a layer's surface is coloured by: its own colour, or a scalar read off its geometry. */
export type LayerSurface = "colour" | CurvatureKind;

/** Every way of surfacing a layer, in the order a selector should offer them. */
export const LAYER_SURFACES: readonly LayerSurface[] = [
  "colour",
  ...CURVATURE_KINDS,
];

/** One-ring passes over the curvature estimate: two is enough to settle scan noise. */
export const DEFAULT_SMOOTHING = 2;
export const MAX_SMOOTHING = 6;

export function clampSmoothing(passes: number): number {
  return Math.min(Math.max(Math.round(passes), 0), MAX_SMOOTHING);
}

/** How one layer was being looked at. */
export interface LayerSettings {
  readonly visible: boolean;
  /** 0 (invisible) to 1 (solid). */
  readonly opacity: number;
  readonly colour: string;
  /** Whether the export's `.matrix4` placement is ticked for this layer. */
  readonly placedByMatrix: boolean;
  /** What the surface is coloured by. Absent in views stored before this existed. */
  readonly surface?: LayerSurface;
  /** One-ring passes over the estimate. Absent in views stored before this existed. */
  readonly smoothing?: number;
}

/** Where the camera was looking from and at, so a session comes back at the same angle. */
export interface CameraView {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}

/**
 * How a bundle was being looked at.
 *
 * Layers are keyed by their id — the path they were read from — so settings find their way back
 * to the right layer when the same bundle is loaded again.
 */
export interface ViewSettings {
  /** 0 leaves the layers as scanned, 1 opens the assembly to twice its scanned height. */
  readonly separation: number;
  readonly layers: Readonly<Record<string, LayerSettings>>;
  /**
   * Read from the viewport when the session is written, never edited by a control, and absent
   * when the camera has not settled anywhere worth remembering.
   */
  readonly camera?: CameraView | null;
  /** Whether the reference grid is showing. Absent in views stored before it was switchable. */
  readonly gridVisible?: boolean;
  /**
   * The layer being shown on its own, if the user left one that way.
   *
   * It belongs to the bundle it was chosen on, so it comes back with that bundle and is dropped
   * by `keepingLayers` when another is loaded.
   */
  readonly isolated?: string | null;
}

export const EMPTY_VIEW_SETTINGS: ViewSettings = {
  separation: 0,
  layers: {},
  camera: null,
  gridVisible: true,
  isolated: null,
};

export function defaultLayerSettings(colour: string): LayerSettings {
  return {
    visible: true,
    opacity: 1,
    colour,
    placedByMatrix: false,
    surface: "colour",
    smoothing: DEFAULT_SMOOTHING,
  };
}

/**
 * A layer shows its own colour unless a scalar was asked for, including in a view stored without
 * one, which is why the setting is optional rather than defaulted at the point of storage.
 */
export function surfaceOf(settings: LayerSettings): LayerSurface {
  return settings.surface ?? "colour";
}

/** Curvature is smoothed twice unless it was left otherwise, including in an older stored view. */
export function smoothingOf(settings: LayerSettings): number {
  return clampSmoothing(settings.smoothing ?? DEFAULT_SMOOTHING);
}

/**
 * The settings for a layer: what was remembered for it, over what it would be by default.
 *
 * Values from storage are clamped as they come back in, because they may have been written by
 * an older version or edited by hand.
 */
export function layerSettingsIn(
  view: ViewSettings,
  id: string,
  defaults: LayerSettings,
): LayerSettings {
  const remembered = view.layers[id];
  if (remembered === undefined) return defaults;

  return {
    visible: remembered.visible,
    opacity: clampUnit(remembered.opacity),
    colour: remembered.colour,
    placedByMatrix: remembered.placedByMatrix,
    surface: remembered.surface,
    smoothing: remembered.smoothing,
  };
}

export function withLayerSettings(
  view: ViewSettings,
  id: string,
  patch: Partial<LayerSettings>,
): ViewSettings {
  const current = view.layers[id];
  if (current === undefined) return view;

  return {
    ...view,
    layers: { ...view.layers, [id]: { ...current, ...patch } },
  };
}

export function withSeparation(
  view: ViewSettings,
  separation: number,
): ViewSettings {
  const clamped = clampUnit(separation);
  return clamped === view.separation ? view : { ...view, separation: clamped };
}

/** The grid shows unless it has been switched off, including in a view stored without it. */
export function gridIsVisible(view: ViewSettings): boolean {
  return view.gridVisible ?? true;
}

export function withGridVisible(
  view: ViewSettings,
  gridVisible: boolean,
): ViewSettings {
  return gridIsVisible(view) === gridVisible ? view : { ...view, gridVisible };
}

/** No layer is shown on its own unless one was left that way. */
export function isolatedOf(view: ViewSettings): string | null {
  return view.isolated ?? null;
}

export function withIsolated(
  view: ViewSettings,
  isolated: string | null,
): ViewSettings {
  return isolatedOf(view) === isolated ? view : { ...view, isolated };
}

/**
 * Narrows a view to the layers a bundle actually has, so ids from another bundle are dropped.
 *
 * Everything else the view holds — the separation, the grid, the camera, anything remembered per
 * layer — is carried over as it was: a different bundle is a different model to look at, not a
 * reason to forget how the last one was being looked at.
 *
 * A layer that is no longer there cannot be the one shown on its own either, and an id left over
 * from another bundle would hide every layer rather than all but one.
 */
export function keepingLayers(
  view: ViewSettings,
  layers: Readonly<Record<string, LayerSettings>>,
): ViewSettings {
  const isolated = isolatedOf(view);

  return {
    ...view,
    layers,
    isolated:
      isolated !== null && layers[isolated] !== undefined ? isolated : null,
  };
}

/**
 * Checks that a stored view is still something this version can read. A record written by an
 * older version is treated as nothing remembered rather than handed on to the UI.
 */
export function isViewSettings(value: unknown): value is ViewSettings {
  if (!isRecord(value)) return false;

  return (
    isFiniteNumber(value.separation) &&
    layersAreKnown(value.layers) &&
    isRemembered(value.camera, isCameraView) &&
    isRemembered(value.gridVisible, isBoolean) &&
    isRemembered(value.isolated, isString)
  );
}

/**
 * A setting this version did not always write: absent, null where a view has one, or something the
 * check accepts.
 */
function isRemembered(
  value: unknown,
  accepts: (held: unknown) => boolean,
): boolean {
  return value === undefined || value === null || accepts(value);
}

/** Every layer of the bundle, each one something this version can read. */
function layersAreKnown(layers: unknown): boolean {
  return isRecord(layers) && Object.values(layers).every(isLayerSettings);
}

function isFiniteNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoolean(value: unknown): boolean {
  return typeof value === "boolean";
}

function isString(value: unknown): boolean {
  return typeof value === "string";
}

function isCameraView(value: unknown): value is CameraView {
  if (!isRecord(value)) return false;

  return isTriple(value["position"]) && isTriple(value["target"]);
}

function isTriple(value: unknown): boolean {
  return (
    Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber)
  );
}

function isLayerSettings(value: unknown): value is LayerSettings {
  if (!isRecord(value)) return false;

  return (
    typeof value.visible === "boolean" &&
    isFiniteNumber(value.opacity) &&
    typeof value.colour === "string" &&
    typeof value.placedByMatrix === "boolean" &&
    (value.surface === undefined || isLayerSurface(value.surface)) &&
    (value.smoothing === undefined || isFiniteNumber(value.smoothing))
  );
}

function isLayerSurface(value: unknown): value is LayerSurface {
  return (
    typeof value === "string" &&
    (LAYER_SURFACES as readonly string[]).includes(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampUnit(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}
