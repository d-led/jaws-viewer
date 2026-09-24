import { describe, expect, it, vi } from "vitest";
import type { FromWorker, ToWorker } from "../src/viewer/curvature-protocol";

type Painted = Extract<FromWorker, { type: "painted" }>;

/** Corners that are the same point to the scanner weld together, so this is well under their spacing. */
const TOLERANCE = 1e-4;

const LAYER = "Case-UpperJaw.stl";

/** A scan as a scanner writes one: every corner of every triangle, in order. */
function soup(
  corners: ReadonlyArray<readonly [number, number, number]>,
): Float32Array {
  const positions = new Float32Array(corners.length * 3);
  corners.forEach(([x, y, z], at) => {
    positions[at * 3] = x;
    positions[at * 3 + 1] = y;
    positions[at * 3 + 2] = z;
  });
  return positions;
}

/** A quad as two triangles: six corners, two of them copies of corners already sent. */
const QUAD = soup([
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
]);

/** A request for a layer's surface, with the geometry only when the thread is being given it. */
function paintRequest(
  options: {
    readonly geometry?: Float32Array;
    readonly surface?: "mean" | "gaussian";
  } = {},
): ToWorker {
  return {
    type: "paint",
    id: LAYER,
    surface: options.surface ?? "mean",
    smoothing: 2,
    ...(options.geometry === undefined
      ? {}
      : {
          geometry: { positions: options.geometry, tolerance: TOLERANCE },
        }),
  };
}

/**
 * The worker, running against a thread of our own.
 *
 * A worker has no interface other than the messages the browser hands it, so it is started here
 * the way the browser starts it: with a `self` to listen on and post to. Loading a fresh copy per
 * test is also what keeps each test's measurements to itself.
 */
interface RunningWorker {
  /** Every reply the worker has posted, in order. */
  readonly posted: FromWorker[];
  /** What each reply handed over, which is how a measurement avoids being copied. */
  readonly handedOver: Array<Transferable[] | undefined>;
  send(request: ToWorker): void;
}

async function startWorker(): Promise<RunningWorker> {
  const posted: FromWorker[] = [];
  const handedOver: Array<Transferable[] | undefined> = [];
  const listening: Array<(event: MessageEvent<ToWorker>) => void> = [];

  vi.stubGlobal("self", {
    postMessage: (message: FromWorker, transfer?: Transferable[]) => {
      posted.push(message);
      handedOver.push(transfer);
    },
    addEventListener: (
      _type: "message",
      listener: (event: MessageEvent<ToWorker>) => void,
    ) => {
      listening.push(listener);
    },
  });
  vi.resetModules();
  await import("../src/viewer/curvature-worker");

  return {
    posted,
    handedOver,
    send(request) {
      for (const listener of listening) {
        listener(new MessageEvent("message", { data: request }));
      }
    },
  };
}

/** The last picture the worker painted, which is the one a test is usually asking about. */
function painted(worker: RunningWorker): Painted {
  const replies = worker.posted.filter(
    (message): message is Painted => message.type === "painted",
  );
  const reply = replies.at(-1);
  if (reply === undefined) throw new Error("The worker painted nothing.");
  return reply;
}

function replyTypes(worker: RunningWorker): string[] {
  return worker.posted.map((message) => message.type);
}

describe("the curvature worker", () => {
  it("says it is measuring before it paints", async () => {
    const worker = await startWorker();

    worker.send(paintRequest({ geometry: QUAD }));

    expect(replyTypes(worker)).toEqual(["measuring", "painted"]);
  });

  it("gives every corner of the scan a colour, and a range to read them against", async () => {
    const worker = await startWorker();

    worker.send(paintRequest({ geometry: QUAD }));
    const reply = painted(worker);

    // Six corners in, six colours out: the picture is per corner of the soup, not per welded vertex.
    expect(reply.colours).toHaveLength(QUAD.length);
    expect(Array.from(reply.colours).every((c) => c >= 0 && c <= 1)).toBe(true);
    expect(reply.range.min).toBeLessThanOrEqual(reply.range.max);
  });

  it("echoes the scalar and the smoothing it was asked for", async () => {
    const worker = await startWorker();

    worker.send(paintRequest({ geometry: QUAD }));

    expect(painted(worker)).toMatchObject({
      id: LAYER,
      surface: "mean",
      smoothing: 2,
    });
  });

  it("keeps the measurement, so a later scalar needs no geometry", async () => {
    const worker = await startWorker();

    worker.send(paintRequest({ geometry: QUAD }));
    worker.send(paintRequest({ surface: "gaussian" }));

    expect(replyTypes(worker)).toEqual(["measuring", "painted", "painted"]);
    expect(painted(worker).surface).toBe("gaussian");
  });

  it("answers a scalar it has already coloured with the same picture", async () => {
    const worker = await startWorker();

    worker.send(paintRequest({ geometry: QUAD }));
    const first = Array.from(painted(worker).colours);
    worker.send(paintRequest());

    expect(Array.from(painted(worker).colours)).toEqual(first);
  });

  it("refuses a layer it has never measured, and says why", async () => {
    const worker = await startWorker();

    worker.send(paintRequest({}));

    expect(worker.posted).toEqual([
      {
        type: "failed",
        id: LAYER,
        reason: expect.stringContaining("not been measured"),
      },
    ]);
  });

  it("hands the colours over rather than copying them", async () => {
    const worker = await startWorker();

    worker.send(paintRequest({ geometry: QUAD }));

    expect(worker.handedOver.at(-1)).toEqual([painted(worker).colours.buffer]);
  });
});
