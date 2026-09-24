import type { CurvatureKind, Range } from "../domain/curvature";

/** A layer's mesh as a corner soup, which is what the curvature fit welds into a surface. */
export interface CornerGeometry {
  readonly positions: Float32Array;
  /** Corners that round to the same multiple of this became one point to the scanner. */
  readonly tolerance: number;
}

export type ToWorker = {
  readonly type: "paint";
  readonly id: string;
  readonly surface: CurvatureKind;
  /** One-ring passes over the estimate before it is coloured. */
  readonly smoothing: number;
  /** Left out once the thread has measured this layer; it keeps the geometry itself. */
  readonly geometry?: CornerGeometry;
};

export type FromWorker =
  | { readonly type: "measuring"; readonly id: string }
  | {
      readonly type: "painted";
      readonly id: string;
      /** Echoed back, so a reply can be told from a request the user has moved on from. */
      readonly surface: CurvatureKind;
      readonly smoothing: number;
      /** Red, green and blue per corner of the soup, 0..1. */
      readonly colours: Float32Array;
      /** The range the colours were scaled to, which is what a legend has to print. */
      readonly range: Range;
      readonly milliseconds: number;
    }
  | { readonly type: "failed"; readonly id: string; readonly reason: string };
