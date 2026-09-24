import {
  BufferAttribute,
  type BufferGeometry,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
} from "three";
import type { LayerSurface } from "../domain/view-settings";
import { assertNever } from "../support/errors";
import type { SurfaceReply } from "./surface-painter";
import type { SurfaceProgress, SurfaceState } from "./viewport";

/** Which layer something is about, so the UI can name it. */
export interface NamedLayer {
  readonly id: string;
  readonly label: string;
}

/** Either the layer's own colour, lit like the rest of the scene, or the map itself, unlit. */
export type SurfaceMaterial = MeshStandardMaterial | MeshBasicMaterial;

/** The part of a layer a surface is shown on: its geometry, its two materials, and what it wants. */
export interface SurfaceLayer extends NamedLayer {
  readonly geometry: BufferGeometry;
  readonly mesh: Mesh<BufferGeometry, SurfaceMaterial>;
  /** The layer's own colour, lit and shaded like the rest of the scene. */
  readonly material: MeshStandardMaterial;
  /**
   * The measured map, unlit.
   *
   * A curvature is a reading rather than a look, and a surface under this scene's lights comes
   * back washed out whatever the ramp says: with the studio environment and a tone curve on top of
   * it, the middle of the ramp prints as white and the ends as pastel. Unlit, the pixel is the
   * value.
   */
  readonly measuredMaterial: MeshBasicMaterial;
  /** What the surface is coloured by, and how hard the estimate is blurred before it is shown. */
  surface: LayerSurface;
  smoothing: number;
  /** Whether the thread already holds this layer's geometry. */
  measured: boolean;
}

/** Puts the layer back to its own colour, with nothing measured showing on it. */
export function showOwnColour(layer: SurfaceLayer): void {
  layer.mesh.material = layer.material;
  layer.geometry.deleteAttribute("color");
}

/** Colours the layer's corners by what the thread measured, and shows them unlit. */
export function showMeasured(layer: SurfaceLayer, colours: Float32Array): void {
  layer.geometry.setAttribute("color", new BufferAttribute(colours, 3));
  layer.mesh.material = layer.measuredMaterial;
}

/**
 * Does what a reply asks of the layer it is about.
 *
 * What to do about a reply that arrived for a scalar the user has already moved on from is
 * `replyFor`'s decision; this is the carrying out. A failure gives the layer its own colour back
 * and lets another attempt send the geometry again — what the layer is asking for is left alone,
 * because the user asked for it and the status line says why it is not there.
 */
export function applySurfaceReply(
  layer: SurfaceLayer,
  reply: SurfaceReply,
  tell: (progress: SurfaceProgress) => void,
): void {
  switch (reply.kind) {
    case "ignore":
      return;
    case "measuring":
      tell(surfaceProgressFor(layer, { state: "measuring" }));
      return;
    case "measured":
      showMeasured(layer, reply.colours);
      tell(
        surfaceProgressFor(layer, {
          state: "painted",
          milliseconds: reply.milliseconds,
          scalar: reply.surface,
          range: reply.range,
        }),
      );
      return;
    case "failed":
      layer.measured = false;
      showOwnColour(layer);
      tell(
        surfaceProgressFor(layer, { state: "failed", reason: reply.reason }),
      );
      return;
    default:
      assertNever(reply);
  }
}

/**
 * What the status line and the legend are told about a layer's surfacing.
 *
 * The state is what happened; naming the layer is what makes it something to show beside the model
 * it happened to.
 */
export function surfaceProgressFor(
  layer: NamedLayer,
  state: SurfaceState,
): SurfaceProgress {
  return { ...state, id: layer.id, label: layer.label };
}
