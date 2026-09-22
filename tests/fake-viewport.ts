import type { Matrix4Entries } from "../src/domain/matrix4";
import type { CameraView } from "../src/domain/view-settings";
import type { ViewController } from "../src/ui/view-controller";
import type {
  AddLayerOutcome,
  LayerSpec,
  StandardView,
  Viewport,
} from "../src/viewer/viewport";

/**
 * Records what the UI asked of the 3D surface, so interaction can be described in tests
 * without a GPU. It stands in for both the `Viewport` and the `ViewController` the panels use.
 */
export class FakeViewport implements Viewport, ViewController {
  readonly layers: LayerSpec[] = [];
  readonly visibilityChanges: Array<{ id: string; visible: boolean }> = [];
  readonly opacityChanges: Array<{ id: string; opacity: number }> = [];
  readonly colourChanges: Array<{ id: string; colour: string }> = [];
  readonly placementChanges: Array<{ id: string; placed: boolean }> = [];
  readonly transformChanges: Array<{
    id: string;
    transform: Matrix4Entries | null;
  }> = [];
  readonly separationFactors: number[] = [];
  readonly framedLayers: string[] = [];
  readonly selectedViews: StandardView[] = [];

  isolated: string | null = null;
  frameCount = 0;
  clearCount = 0;
  gridVisible = true;
  disposed = false;
  camera: CameraView | null = null;
  readonly cameraChanges: CameraView[] = [];

  /** Set to make `addLayer` fail, to exercise the reporting path. */
  failAddLayer = false;

  addLayer(spec: LayerSpec): AddLayerOutcome {
    if (this.failAddLayer)
      return { ok: false, reason: "the mesh could not be read" };
    this.layers.push(spec);
    return { ok: true };
  }

  clearLayers(): void {
    this.layers.length = 0;
    this.clearCount += 1;
  }

  setLayerVisible(id: string, visible: boolean): void {
    this.visibilityChanges.push({ id, visible });
  }

  setLayerOpacity(id: string, opacity: number): void {
    this.opacityChanges.push({ id, opacity });
  }

  setLayerColour(id: string, colour: string): void {
    this.colourChanges.push({ id, colour });
  }

  setLayerTransform(id: string, transform: Matrix4Entries | null): void {
    this.transformChanges.push({ id, transform });
  }

  isolate(id: string | null): void {
    this.isolated = id;
  }

  setLayerPlaced(id: string, placed: boolean): void {
    this.placementChanges.push({ id, placed });
  }

  setSeparation(factor: number): void {
    this.separationFactors.push(factor);
  }

  fitAll(): void {
    this.frameCount += 1;
  }

  fitLayer(id: string): void {
    this.framedLayers.push(id);
  }

  setView(view: StandardView): void {
    this.selectedViews.push(view);
  }

  setGridVisible(visible: boolean): void {
    this.gridVisible = visible;
  }

  getCamera(): CameraView {
    return this.camera ?? { position: [0, 0, 120], target: [0, 0, 0] };
  }

  setCamera(view: CameraView): void {
    this.camera = view;
    this.cameraChanges.push(view);
  }

  dispose(): void {
    this.disposed = true;
  }
}
