import { curvatureColour } from "../domain/colour-ramp";
import {
  curvatureField,
  curvatureKindIsSigned,
  onRamp,
  principalCurvatures,
  robustRange,
  smoothed,
  symmetricRange,
  weld,
  type CurvatureKind,
  type PrincipalCurvature,
  type Range,
  type WeldedMesh,
} from "../domain/curvature";
import { errorMessage } from "../support/errors";
import { createMemo, type Memo } from "../support/memo";
import type {
  CornerGeometry,
  FromWorker,
  ToWorker,
} from "./curvature-protocol";

/**
 * The worker's own view of the outside world.
 *
 * Declared here rather than borrowed from `lib.webworker`, which cannot be added to a project
 * that already compiles against the DOM library.
 */
interface WorkerScope {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<ToWorker>) => void,
  ): void;
  postMessage(message: FromWorker, transfer: Transferable[]): void;
}

declare const self: WorkerScope;

/**
 * Curvature is measured here rather than on the main thread: welding and fitting a couple of
 * hundred thousand triangles takes long enough to drop a frame, and none of it touches the DOM or
 * the GPU — it is plain typed-array arithmetic and a pure domain module.
 *
 * A layer is measured once and then re-coloured out of the measurement, which is what makes
 * switching between scalars feel immediate.
 */
/** A layer's surface, ready to be turned into corner colours. */
interface Shading {
  /** Where each vertex sits on the ramp. */
  readonly ramp: Float32Array;
  /** What that ramp spans, which is what the legend beside the model has to print. */
  readonly range: Range;
}

interface Measurement {
  readonly mesh: WeldedMesh;
  readonly curvature: PrincipalCurvature;
  /**
   * The shading already worked out for this layer, most recent kept.
   *
   * Every scalar is read off the same measurement, so one already looked at should cost nothing to
   * look at again — and a smoothing control being dragged back asks for values it has asked for
   * before.
   */
  readonly shades: Memo<string, Shading>;
}

/** Fields kept per layer: enough for a handful of scalars, small enough to forget without pain. */
const KEPT_FIELDS = 4;

const measured = new Map<string, Measurement>();

self.addEventListener("message", (event: MessageEvent<ToWorker>): void => {
  try {
    paint(event.data);
  } catch (error) {
    respond({
      type: "failed",
      id: event.data.id,
      reason: errorMessage(error),
    });
  }
});

function paint(request: ToWorker): void {
  const started = performance.now();
  const measurement =
    request.geometry === undefined
      ? measured.get(request.id)
      : measure(request.id, request.geometry);

  if (measurement === undefined) {
    throw new Error("this layer has not been measured");
  }

  const shading = shadingFor(measurement, request.surface, request.smoothing);
  const colours = coloursFor(
    shading.ramp,
    measurement.mesh.indices,
    curvatureKindIsSigned(request.surface),
  );

  respond(
    {
      type: "painted",
      id: request.id,
      surface: request.surface,
      smoothing: request.smoothing,
      colours,
      range: shading.range,
      milliseconds: performance.now() - started,
    },
    [colours.buffer],
  );
}

function measure(id: string, geometry: CornerGeometry): Measurement {
  respond({ type: "measuring", id });

  const mesh = weld(geometry.positions, geometry.tolerance);
  const measurement: Measurement = {
    mesh,
    curvature: principalCurvatures(mesh),
    shades: createMemo(KEPT_FIELDS),
  };
  measured.set(id, measurement);
  return measurement;
}

/** The shading for a scalar at a smoothing, worked out once and then remembered. */
function shadingFor(
  measurement: Measurement,
  surface: CurvatureKind,
  smoothing: number,
): Shading {
  const key = `${surface}:${smoothing}`;
  const kept = measurement.shades.get(key);
  if (kept !== undefined) return kept;

  const field = smoothed(
    curvatureField(measurement.curvature, surface),
    measurement.mesh,
    smoothing,
  );
  const signed = curvatureKindIsSigned(surface);
  const range = signed ? symmetricRange(field) : robustRange(field);
  const shading: Shading = { ramp: onRamp(field, range, signed), range };

  measurement.shades.set(key, shading);
  return shading;
}

/**
 * Colours every corner of the soup.
 *
 * A signed scalar reads as groove–flat–ridge across the whole ramp and a magnitude from cold to
 * warm, which is what the legend beside the model draws.
 */
function coloursFor(
  ramp: Float32Array,
  corners: Uint32Array,
  signed: boolean,
): Float32Array {
  const colours = new Float32Array(corners.length * 3);

  for (let corner = 0; corner < corners.length; corner += 1) {
    const [r, g, b] = curvatureColour(ramp[corners[corner]!]!, signed);
    colours[corner * 3] = r;
    colours[corner * 3 + 1] = g;
    colours[corner * 3 + 2] = b;
  }
  return colours;
}

function respond(message: FromWorker, transfer: Transferable[] = []): void {
  self.postMessage(message, transfer);
}
