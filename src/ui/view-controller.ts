import type { LayerSurface } from "../domain/view-settings";

/**
 * The edits the panels can ask for.
 *
 * Panels describe intent and nothing more — the app decides what that means for the 3D surface
 * and for what gets remembered. That also lets the panels be tested against a stand-in.
 */
export interface ViewController {
  setLayerVisible(id: string, visible: boolean): void;
  /** `opacity` is 0 (invisible) to 1 (solid). */
  setLayerOpacity(id: string, opacity: number): void;
  setLayerColour(id: string, colour: string): void;
  /** Colours the layer by its own colour, or by a scalar measured from its surface. */
  setLayerSurface(id: string, surface: LayerSurface): void;
  /** One-ring passes the curvature estimate is blurred by, 0 to `MAX_SMOOTHING`. */
  setLayerSmoothing(id: string, smoothing: number): void;
  /** Shows `id` on its own, or restores every layer the user left visible when given `null`. */
  isolate(id: string | null): void;
  /** Ticks or unticks the export's `.matrix4` placement for a layer. */
  setLayerPlaced(id: string, placed: boolean): void;
  /** Shows or hides the reference grid, which sits alongside the layers but is not one. */
  setGridVisible(visible: boolean): void;
  /** 0 leaves the layers as scanned, 1 opens the assembly to twice its scanned height. */
  setSeparation(factor: number): void;
}
