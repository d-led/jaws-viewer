import type { Matrix4Entries } from "../domain/matrix4";
import type { CameraView } from "../domain/view-settings";

/** Orthographic directions the camera can snap to. Assumes a Z-up scan space. */
export type StandardView =
  "top" | "bottom" | "front" | "back" | "left" | "right";

export interface LayerSpec {
  readonly id: string;
  readonly label: string;
  readonly colour: string;
  /** Raw STL bytes; the viewport decides how to decode them. */
  readonly stl: ArrayBuffer;
}

export type AddLayerOutcome =
  { readonly ok: true } | { readonly ok: false; readonly reason: string };

export interface ViewportStats {
  readonly fps: number;
  readonly visibleTriangles: number;
  readonly drawCalls: number;
}

export interface ViewportOptions {
  readonly onStats?: (stats: ViewportStats) => void;
  /** Called when the camera settles, so where it ended up can be remembered. */
  readonly onCameraSettled?: () => void;
}

/**
 * The 3D surface the UI drives.
 *
 * The UI never talks to a renderer directly, so interaction can be tested against a
 * stand-in and the rendering library stays replaceable.
 */
export interface Viewport {
  addLayer(spec: LayerSpec): AddLayerOutcome;
  clearLayers(): void;

  setLayerVisible(id: string, visible: boolean): void;
  /** `opacity` is 0 (invisible) to 1 (solid). */
  setLayerOpacity(id: string, opacity: number): void;
  setLayerColour(id: string, colour: string): void;
  /** Places the layer with the export's `.matrix4` transform, or leaves it in scan space. */
  setLayerTransform(id: string, transform: Matrix4Entries | null): void;

  /** Shows `id` on its own, or restores every layer the user left visible when given `null`. */
  isolate(id: string | null): void;

  /**
   * Spreads the layers apart along the occlusal axis: `0` leaves them as scanned, `1` opens
   * the assembly to twice its scanned height.
   */
  setSeparation(factor: number): void;

  fitAll(): void;
  fitLayer(id: string): void;
  setView(view: StandardView): void;
  setGridVisible(visible: boolean): void;

  /** Where the camera is now, for remembering a session. */
  getCamera(): CameraView;
  /** Puts the camera back where it was left. */
  setCamera(view: CameraView): void;

  dispose(): void;
}
