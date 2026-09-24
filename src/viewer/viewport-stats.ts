import type { Object3D } from "three";
import type { ViewportStats } from "./viewport";

/** How often the readout is refreshed: twice a second is enough to watch, and rare enough to read. */
export const STATS_INTERVAL_SECONDS = 0.5;

/** What a reading says about the work, read off the renderer when the reading is due. */
export interface DrawnContent {
  readonly visibleTriangles: number;
  readonly drawCalls: number;
}

/** Counts frames and time, and hands out a reading once an interval has gone by. */
export interface StatsWindow {
  /**
   * Adds one frame of `elapsed` seconds.
   *
   * `drawn` is asked for only when the interval closes, so the frames in between cost nothing to
   * measure and the frame rate is an average over the whole interval rather than of one frame.
   */
  add(elapsed: number, drawn: () => DrawnContent): ViewportStats | null;
}

export function createStatsWindow(intervalSeconds: number): StatsWindow {
  let frames = 0;
  let seconds = 0;

  return {
    add(elapsed, drawn) {
      frames += 1;
      seconds += elapsed;
      if (seconds < intervalSeconds) return null;

      const stats: ViewportStats = {
        fps: Math.round(frames / seconds),
        ...drawn(),
      };
      frames = 0;
      seconds = 0;
      return stats;
    },
  };
}

/** A layer as a frame draws it: the mesh the renderer is showing, and how much it holds. */
export interface DrawnLayer {
  readonly mesh: Object3D;
  readonly triangles: number;
}

/** How many triangles are on screen: the ones the renderer will draw, and no others. */
export function visibleTrianglesOf(layers: Iterable<DrawnLayer>): number {
  let total = 0;
  for (const layer of layers) {
    if (layer.mesh.visible) total += layer.triangles;
  }
  return total;
}
