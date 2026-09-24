import type { CurvatureKind, Range } from "../domain/curvature";
import type { LayerSurface } from "../domain/view-settings";
import { assertNever } from "../support/errors";
import type { FromWorker, ToWorker } from "./curvature-protocol";

export interface PaintRequest {
  readonly id: string;
  readonly surface: CurvatureKind;
  readonly smoothing: number;
  /** Sent the first time a layer is painted, and left out afterwards. */
  readonly geometry?: {
    readonly positions: Float32Array;
    readonly tolerance: number;
  };
}

export type SurfaceEvent =
  | { readonly kind: "measuring"; readonly id: string }
  | {
      readonly kind: "painted";
      readonly id: string;
      readonly surface: CurvatureKind;
      readonly smoothing: number;
      readonly colours: Float32Array;
      /** The range the colours were scaled to, which is what a legend has to print. */
      readonly range: Range;
      readonly milliseconds: number;
    }
  | { readonly kind: "failed"; readonly id: string; readonly reason: string };

/**
 * What a layer is asking to be shown as.
 *
 * Its own colour is a request like any other, and one that no measured reply can match — which is
 * how a reply that arrives after the user has switched back to plain colour is dropped.
 */
export interface WantedSurface {
  readonly surface: LayerSurface;
  readonly smoothing: number;
}

/** What a reply means for the layer it is about. */
export type SurfaceReply =
  | { readonly kind: "ignore" }
  | { readonly kind: "measuring" }
  | {
      readonly kind: "measured";
      readonly surface: CurvatureKind;
      readonly colours: Float32Array;
      readonly range: Range;
      readonly milliseconds: number;
    }
  | { readonly kind: "failed"; readonly reason: string };

/**
 * The reply to act on, or nothing when it has been overtaken.
 *
 * A reply can arrive for a scalar or a smoothing the user has already moved on from, because the
 * request was in the thread when they changed their mind; acting on it would put a picture on
 * screen that the controls beside it do not describe. Kept apart from the viewport because it is
 * the part with a decision in it.
 */
export function replyFor(
  event: SurfaceEvent,
  wanted: WantedSurface,
): SurfaceReply {
  switch (event.kind) {
    case "measuring":
      return { kind: "measuring" };
    case "failed":
      return { kind: "failed", reason: event.reason };
    case "painted":
      return event.surface === wanted.surface &&
        event.smoothing === wanted.smoothing
        ? {
            kind: "measured",
            surface: event.surface,
            colours: event.colours,
            range: event.range,
            milliseconds: event.milliseconds,
          }
        : { kind: "ignore" };
    default:
      return assertNever(event);
  }
}

/** What this file needs of a worker: the rest of `Worker` is unused and unusable in a test. */
export interface WorkerThread {
  postMessage(message: ToWorker, transfer?: Transferable[]): void;
  terminate(): void;
}

export interface ThreadHandlers {
  received(message: FromWorker): void;
  /** The thread itself failed, so nothing more will come back from it. */
  broke(reason: string): void;
}

/** Starts a thread and wires its replies to `handlers`. */
export type StartThread = (handlers: ThreadHandlers) => WorkerThread;

/**
 * Measures curvature off the main thread and hands back a colour per corner.
 *
 * This side is only transport: it forwards requests, keeps one in flight per layer, and reports
 * what comes back — including the failure of the thread itself, which would otherwise be silence.
 */
export interface SurfacePainter {
  paint(request: PaintRequest): void;
  /**
   * Stops the thread and leaves none behind, dropping everything it had measured.
   *
   * Terminating is the only way to stop a fit that is already running: a worker cannot be
   * interrupted between two statements, and measuring a jaw is a long run of them. It takes the
   * other layers' measurements with it, so it is for when they are worthless — the bundle they
   * were measured from having been replaced.
   */
  discard(): void;
  onEvent(listener: (event: SurfaceEvent) => void): void;
  dispose(): void;
}

/** The browser's worker, seen through the narrow shape above. */
const startCurvatureThread: StartThread = (handlers) => {
  const worker = new Worker(new URL("./curvature-worker.ts", import.meta.url), {
    type: "module",
  });

  worker.addEventListener(
    "message",
    (event: MessageEvent<FromWorker>): void => {
      handlers.received(event.data);
    },
  );
  worker.addEventListener("error", (event: ErrorEvent): void => {
    handlers.broke(
      event.message === "" ? "the measuring worker stopped" : event.message,
    );
  });

  return {
    postMessage: (message, transfer) =>
      worker.postMessage(message, transfer ?? []),
    terminate: () => worker.terminate(),
  };
};

export function createSurfacePainter(
  startThread: StartThread = startCurvatureThread,
): SurfacePainter {
  const listeners: Array<(event: SurfaceEvent) => void> = [];
  /** The layers whose colours are still on their way. */
  const inFlight = new Set<string>();
  /** The newest request for a layer that already has one on its way. */
  const pending = new Map<string, PaintRequest>();

  /** Started by the first request, and left unstarted by a cancel. */
  let thread: WorkerThread | null = null;
  let stopped: string | null = null;

  function announce(event: SurfaceEvent): void {
    for (const listener of listeners) listener(event);
  }

  function received(message: FromWorker): void {
    // Still working: this neither ends the wait nor frees the queue behind it.
    if (message.type === "measuring") {
      announce({ kind: "measuring", id: message.id });
      return;
    }

    inFlight.delete(message.id);
    announce(settledBy(message));
    sendNext(message.id);
  }

  function broke(reason: string): void {
    // A thread that dies says nothing through its replies, so everything waiting on it has to be
    // told; without that, a control would silently do nothing.
    stopped = reason;
    for (const id of inFlight) announce({ kind: "failed", id, reason });
    inFlight.clear();
    pending.clear();
  }

  function send(request: PaintRequest): void {
    if (stopped !== null) {
      announce({ kind: "failed", id: request.id, reason: stopped });
      return;
    }

    // Nothing is started until a scalar is asked for: opening a bundle is no reason to spawn a
    // thread, and a cancel leaves none behind.
    const worker = (thread ??= startThread({ received, broke }));
    inFlight.add(request.id);

    // The corners become the thread's own copy, so the buffer is handed over rather than copied
    // again on the other side of the wall.
    const message: ToWorker = { type: "paint", ...request };
    worker.postMessage(
      message,
      request.geometry === undefined
        ? undefined
        : [request.geometry.positions.buffer],
    );
  }

  /** Sends whichever request replaced the one just answered, if any. */
  function sendNext(id: string): void {
    const next = pending.get(id);
    if (next === undefined) return;

    pending.delete(id);
    send(next);
  }

  return {
    paint(request) {
      // One request per layer at a time. Dragging the smoothing control asks for a variant per
      // pixel of movement and all but the last would be thrown away, so only the last is kept.
      if (inFlight.has(request.id)) {
        pending.set(request.id, superseded(pending.get(request.id), request));
        return;
      }
      send(request);
    },

    discard() {
      thread?.terminate();
      thread = null;
      inFlight.clear();
      pending.clear();
      stopped = null;
    },

    onEvent(listener) {
      listeners.push(listener);
    },

    dispose() {
      thread?.terminate();
      thread = null;
      inFlight.clear();
      pending.clear();
      listeners.length = 0;
    },
  };
}

/** The newest request wins; whichever of the two is carrying the geometry keeps it. */
function superseded(
  held: PaintRequest | undefined,
  next: PaintRequest,
): PaintRequest {
  const geometry = next.geometry ?? held?.geometry;
  return geometry === undefined ? next : { ...next, geometry };
}

/** The event a reply turns into; `measuring` is not one, because the work is still going. */
function settledBy(
  message: Exclude<FromWorker, { type: "measuring" }>,
): SurfaceEvent {
  switch (message.type) {
    case "painted":
      return {
        kind: "painted",
        id: message.id,
        surface: message.surface,
        smoothing: message.smoothing,
        colours: message.colours,
        range: message.range,
        milliseconds: message.milliseconds,
      };
    case "failed":
      return { kind: "failed", id: message.id, reason: message.reason };
    default:
      return assertNever(message);
  }
}
