import { describe, expect, it } from "vitest";
import type { CurvatureKind } from "../src/domain/curvature";
import type { FromWorker } from "../src/viewer/curvature-protocol";
import {
  createSurfacePainter,
  replyFor,
  type SurfaceEvent,
  type SurfacePainter,
} from "../src/viewer/surface-painter";
import { FakeThreads } from "./fake-worker-thread";

/** Fresh corners per request: a real thread is handed the buffer and never gives it back. */
function corners(): { positions: Float32Array; tolerance: number } {
  return {
    positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    tolerance: 1e-4,
  };
}

/** What a layer is asking to be shown as, unless a test says otherwise. */
const WANTED = { surface: "mean", smoothing: 2 } as const;

/** The range a reply is scaled over, unless a test says otherwise. */
const RANGE = { min: -0.4, max: 0.4 } as const;

function painted(
  id: string,
  surface: CurvatureKind = "sharpness",
  smoothing = 2,
): FromWorker {
  return {
    type: "painted",
    id,
    surface,
    smoothing,
    colours: new Float32Array(3),
    range: RANGE,
    milliseconds: 12,
  };
}

function painterUnderTest(): {
  painter: SurfacePainter;
  threads: FakeThreads;
  events: SurfaceEvent[];
} {
  const threads = new FakeThreads();
  const painter = createSurfacePainter(threads.start);
  const events: SurfaceEvent[] = [];
  painter.onEvent((event) => events.push(event));

  return { painter, threads, events };
}

/** The event the painter raises when colours come back for a layer. */
function coloursArrived(
  id: string,
  surface: CurvatureKind = "mean",
  smoothing = 2,
): SurfaceEvent {
  return {
    kind: "painted",
    id,
    surface,
    smoothing,
    colours: new Float32Array(3),
    range: RANGE,
    milliseconds: 12,
  };
}

describe("a reply that arrives for a layer", () => {
  it("is the colours, while the layer is asking for the same scalar", () => {
    expect(
      replyFor(coloursArrived("upper", "mean", 2), {
        surface: "mean",
        smoothing: 2,
      }),
    ).toEqual({
      kind: "measured",
      surface: "mean",
      colours: new Float32Array(3),
      range: RANGE,
      milliseconds: 12,
    });
  });

  it("is nothing once the layer has moved on to another scalar", () => {
    expect(
      replyFor(coloursArrived("upper", "mean"), {
        surface: "sharpness",
        smoothing: 2,
      }),
    ).toEqual({ kind: "ignore" });
  });

  it("is nothing once the layer has moved on to another smoothing", () => {
    expect(
      replyFor(coloursArrived("upper", "mean", 5), {
        surface: "mean",
        smoothing: 2,
      }),
    ).toEqual({ kind: "ignore" });
  });

  it("says that a measurement is under way", () => {
    expect(replyFor({ kind: "measuring", id: "upper" }, WANTED)).toEqual({
      kind: "measuring",
    });
  });

  it("carries the reason a measurement failed", () => {
    expect(
      replyFor({ kind: "failed", id: "upper", reason: "boom" }, WANTED),
    ).toEqual({ kind: "failed", reason: "boom" });
  });
});

describe("asking for a layer's colours", () => {
  it("starts no thread until a scalar is asked for", () => {
    const { threads } = painterUnderTest();

    expect(threads.started).toEqual([]);
  });

  it("hands the corners over with the first request and not with later ones", () => {
    const { painter, threads } = painterUnderTest();

    painter.paint({
      id: "upper",
      surface: "sharpness",
      smoothing: 2,
      geometry: corners(),
    });
    threads.current.reply(painted("upper"));
    painter.paint({ id: "upper", surface: "mean", smoothing: 2 });

    expect(threads.current.asked).toHaveLength(2);
    expect(threads.current.asked[0]).toHaveProperty("geometry");
    expect(threads.current.asked[1]).not.toHaveProperty("geometry");
  });

  it("gives the corners to the thread rather than copying them again", () => {
    const { painter, threads } = painterUnderTest();
    const geometry = corners();

    painter.paint({
      id: "upper",
      surface: "mean",
      smoothing: 2,
      geometry,
    });

    expect(threads.current.handedOver[0]).toEqual([geometry.positions.buffer]);
  });

  it("keeps only the newest request while one is already on its way", () => {
    const { painter, threads } = painterUnderTest();

    painter.paint({
      id: "upper",
      surface: "sharpness",
      smoothing: 2,
      geometry: corners(),
    });
    painter.paint({ id: "upper", surface: "mean", smoothing: 2 });
    painter.paint({ id: "upper", surface: "gaussian", smoothing: 2 });
    threads.current.reply(painted("upper", "sharpness"));

    // The scalar the user passed through on the way is never worked out at all.
    expect(threads.current.asked.map((asked) => asked.surface)).toEqual([
      "sharpness",
      "gaussian",
    ]);
  });

  it("keeps only the newest smoothing while one is already on its way", () => {
    const { painter, threads } = painterUnderTest();
    painter.paint({
      id: "upper",
      surface: "sharpness",
      smoothing: 2,
      geometry: corners(),
    });

    for (const passes of [3, 4, 5, 6]) {
      painter.paint({ id: "upper", surface: "sharpness", smoothing: passes });
    }
    threads.current.reply(painted("upper", "sharpness", 2));

    expect(threads.current.asked.map((asked) => asked.smoothing)).toEqual([
      2, 6,
    ]);
  });

  it("asks for one layer while another is still being measured", () => {
    const { painter, threads } = painterUnderTest();

    painter.paint({
      id: "upper",
      surface: "mean",
      smoothing: 2,
      geometry: corners(),
    });
    painter.paint({
      id: "lower",
      surface: "mean",
      smoothing: 2,
      geometry: corners(),
    });

    expect(threads.current.asked).toHaveLength(2);
  });

  it("reports the colours that come back", () => {
    const { painter, threads, events } = painterUnderTest();
    painter.paint({
      id: "upper",
      surface: "mean",
      smoothing: 2,
      geometry: corners(),
    });

    threads.current.reply({ type: "measuring", id: "upper" });
    threads.current.reply(painted("upper", "mean"));

    expect(events).toEqual([
      { kind: "measuring", id: "upper" },
      {
        kind: "painted",
        id: "upper",
        surface: "mean",
        smoothing: 2,
        colours: new Float32Array(3),
        range: RANGE,
        milliseconds: 12,
      },
    ]);
  });
});

describe("a thread that dies", () => {
  it("reports the failure against every layer it was waiting for", () => {
    const { painter, threads, events } = painterUnderTest();

    painter.paint({
      id: "upper",
      surface: "mean",
      smoothing: 2,
      geometry: corners(),
    });
    painter.paint({
      id: "lower",
      surface: "mean",
      smoothing: 2,
      geometry: corners(),
    });
    threads.current.break("the worker could not start");

    expect(events).toEqual([
      { kind: "failed", id: "upper", reason: "the worker could not start" },
      { kind: "failed", id: "lower", reason: "the worker could not start" },
    ]);
  });

  it("fails later requests at once rather than leaving them waiting for nothing", () => {
    const { painter, threads, events } = painterUnderTest();

    painter.paint({
      id: "upper",
      surface: "mean",
      smoothing: 2,
      geometry: corners(),
    });
    threads.current.break("boom");
    painter.paint({
      id: "other",
      surface: "mean",
      smoothing: 2,
      geometry: corners(),
    });

    expect(events.at(-1)).toEqual({
      kind: "failed",
      id: "other",
      reason: "boom",
    });
  });
});

describe("cancelling a measurement", () => {
  it("stops the thread there and then, and hears nothing more from it", () => {
    const { painter, threads, events } = painterUnderTest();
    painter.paint({
      id: "upper",
      surface: "sharpness",
      smoothing: 2,
      geometry: corners(),
    });
    const cancelled = threads.current;

    painter.discard();
    cancelled.reply(painted("upper"));

    expect(cancelled.terminated).toBe(true);
    expect(events).toEqual([]);
  });

  it("starts a fresh thread when a scalar is asked for again", () => {
    const { painter, threads } = painterUnderTest();
    painter.paint({
      id: "upper",
      surface: "sharpness",
      smoothing: 2,
      geometry: corners(),
    });

    painter.discard();
    painter.paint({
      id: "upper",
      surface: "mean",
      smoothing: 2,
      geometry: corners(),
    });

    expect(threads.started).toHaveLength(2);
    expect(threads.current.asked).toHaveLength(1);
  });

  it("gives a broken thread another chance", () => {
    const { painter, threads } = painterUnderTest();
    painter.paint({
      id: "upper",
      surface: "mean",
      smoothing: 2,
      geometry: corners(),
    });
    threads.current.break("boom");

    painter.discard();
    painter.paint({
      id: "upper",
      surface: "mean",
      smoothing: 2,
      geometry: corners(),
    });

    expect(threads.started).toHaveLength(2);
    expect(threads.current.asked).toHaveLength(1);
  });
});
