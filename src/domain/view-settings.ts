/** How one layer was being looked at. */
export interface LayerSettings {
  readonly visible: boolean;
  /** 0 (invisible) to 1 (solid). */
  readonly opacity: number;
  readonly colour: string;
  /** Whether the export's `.matrix4` placement is ticked for this layer. */
  readonly placedByMatrix: boolean;
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
 * to the right layer when the same bundle is loaded again. `isolate` is deliberately absent: it
 * is a momentary thing to do to a model, not a way of looking at it.
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
}

export const EMPTY_VIEW_SETTINGS: ViewSettings = {
  separation: 0,
  layers: {},
  camera: null,
  gridVisible: true,
};

export function defaultLayerSettings(colour: string): LayerSettings {
  return { visible: true, opacity: 1, colour, placedByMatrix: false };
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

/** Takes only the layers a bundle actually has, so ids from another bundle are dropped. */
export function keepingLayers(
  view: ViewSettings,
  layers: Readonly<Record<string, LayerSettings>>,
): ViewSettings {
  return { separation: view.separation, layers };
}

/**
 * Checks that a stored view is still something this version can read. A record written by an
 * older version is treated as nothing remembered rather than handed on to the UI.
 */
export function isViewSettings(value: unknown): value is ViewSettings {
  if (!isRecord(value)) return false;
  if (
    typeof value.separation !== "number" ||
    !Number.isFinite(value.separation)
  )
    return false;
  if (!isRecord(value.layers)) return false;
  if (!Object.values(value.layers).every(isLayerSettings)) return false;

  // Absent is fine: a view stored before these were remembered is still usable.
  if (
    value.camera !== undefined &&
    value.camera !== null &&
    !isCameraView(value.camera)
  ) {
    return false;
  }
  return (
    value.gridVisible === undefined || typeof value.gridVisible === "boolean"
  );
}

function isCameraView(value: unknown): value is CameraView {
  if (!isRecord(value)) return false;

  return isTriple(value["position"]) && isTriple(value["target"]);
}

function isTriple(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

function isLayerSettings(value: unknown): value is LayerSettings {
  if (!isRecord(value)) return false;

  return (
    typeof value.visible === "boolean" &&
    typeof value.opacity === "number" &&
    Number.isFinite(value.opacity) &&
    typeof value.colour === "string" &&
    typeof value.placedByMatrix === "boolean"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampUnit(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}
