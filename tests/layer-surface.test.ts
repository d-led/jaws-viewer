import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from "three";
import { describe, expect, it, vi } from "vitest";
import {
  applySurfaceReply,
  showMeasured,
  showOwnColour,
  surfaceProgressFor,
  type SurfaceLayer,
  type SurfaceMaterial,
} from "../src/viewer/layer-surface";
import type { SurfaceReply } from "../src/viewer/surface-painter";

const COLOURS = new Float32Array([0.1, 0.2, 0.3]);
const RANGE = { min: -1, max: 1 };

/** A layer with the two materials it swaps between, as the viewport builds one. */
function layer(surface: SurfaceLayer["surface"] = "mean") {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
  );

  const material = new MeshStandardMaterial({ color: 0x63b3ed });
  const measuredMaterial = new MeshBasicMaterial({ vertexColors: true });
  const mesh: Mesh<BufferGeometry, SurfaceMaterial> = new Mesh(
    geometry,
    material,
  );

  const target: SurfaceLayer = {
    id: "Case-UpperJaw.stl",
    label: "Upper Jaw",
    geometry,
    mesh,
    material,
    measuredMaterial,
    surface,
    smoothing: 2,
    measured: false,
  };

  return { layer: target, geometry, material, measuredMaterial };
}

const MEASURED: SurfaceReply = {
  kind: "measured",
  surface: "mean",
  colours: COLOURS,
  range: RANGE,
  milliseconds: 42,
};

describe("showing a layer's surface", () => {
  it("puts the measured colours on the layer, unlit", () => {
    const { layer: target, geometry, measuredMaterial } = layer();

    showMeasured(target, COLOURS);

    expect(target.mesh.material).toBe(measuredMaterial);
    expect(geometry.attributes["color"]?.array).toEqual(COLOURS);
  });

  it("puts the layer's own colour back, with nothing measured left on it", () => {
    const { layer: target, geometry, material } = layer();
    showMeasured(target, COLOURS);

    showOwnColour(target);

    expect(target.mesh.material).toBe(material);
    expect(geometry.attributes["color"]).toBeUndefined();
  });
});

describe("doing what a reply asks", () => {
  it("shows the colours and says what they are scaled to, which is what a legend prints", () => {
    const { layer: target, measuredMaterial } = layer();
    const told = vi.fn();

    applySurfaceReply(target, MEASURED, told);

    expect(target.mesh.material).toBe(measuredMaterial);
    expect(told).toHaveBeenCalledWith({
      id: "Case-UpperJaw.stl",
      label: "Upper Jaw",
      state: "painted",
      milliseconds: 42,
      scalar: "mean",
      range: RANGE,
    });
  });

  it("gives the layer its own colour back when the measurement fails, and allows another try", () => {
    const { layer: target, geometry, material } = layer();
    target.measured = true;
    const told = vi.fn();

    applySurfaceReply(
      target,
      { kind: "failed", reason: "the thread gave up" },
      told,
    );

    expect(target.mesh.material).toBe(material);
    expect(geometry.attributes["color"]).toBeUndefined();
    expect(target.measured).toBe(false);
    expect(told).toHaveBeenCalledWith({
      id: "Case-UpperJaw.stl",
      label: "Upper Jaw",
      state: "failed",
      reason: "the thread gave up",
    });
  });

  it("leaves what is on screen alone while a measurement is still running", () => {
    const { layer: target, measuredMaterial } = layer();
    showMeasured(target, COLOURS);
    const told = vi.fn();

    applySurfaceReply(target, { kind: "measuring" }, told);

    expect(target.mesh.material).toBe(measuredMaterial);
    expect(told).toHaveBeenCalledWith(
      expect.objectContaining({ state: "measuring" }),
    );
  });

  it("changes nothing and says nothing about a reply the user has moved on from", () => {
    const { layer: target, geometry, material } = layer();
    const told = vi.fn();

    applySurfaceReply(target, { kind: "ignore" }, told);

    expect(target.mesh.material).toBe(material);
    expect(geometry.attributes["color"]).toBeUndefined();
    expect(target.measured).toBe(false);
    expect(told).not.toHaveBeenCalled();
  });
});

describe("naming a layer in a report", () => {
  it("carries the layer's name alongside what happened to it", () => {
    expect(
      surfaceProgressFor(
        { id: "Case-LowerJaw.stl", label: "Lower Jaw" },
        { state: "measuring" },
      ),
    ).toEqual({
      id: "Case-LowerJaw.stl",
      label: "Lower Jaw",
      state: "measuring",
    });
  });
});
