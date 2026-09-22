// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  LAYER_IDS,
  createTestApp,
  exportBundleFiles,
  exportFiles,
  opacitySlider,
  separationSlider,
  statusText,
  storageText,
} from "./app-harness";

const EXPORT_FILES = exportFiles();

describe("keeping a session for the next visit", () => {
  it("brings back the bundle that was open last time", async () => {
    const { app, viewport, store, root } = createTestApp();
    store.files = exportBundleFiles();

    await app.restore();

    expect(viewport.layers.map((layer) => layer.label)).toEqual([
      "Upper Jaw",
      "Lower Jaw",
      "Total Jaw 0",
    ]);
    expect(statusText(root)).toContain("Restored from your last visit");
    expect(root.querySelector(".empty")?.hasAttribute("hidden")).toBe(true);
  });

  it("brings back how the layers were being looked at", async () => {
    const { app, viewport, store, root } = createTestApp();
    store.files = exportBundleFiles();
    store.view = {
      separation: 0.45,
      layers: {
        [LAYER_IDS.upper]: {
          visible: false,
          opacity: 0.25,
          colour: "#ff8800",
          placedByMatrix: true,
        },
      },
    };

    await app.restore();

    expect(viewport.visibilityChanges).toContainEqual({
      id: LAYER_IDS.upper,
      visible: false,
    });
    expect(viewport.opacityChanges).toContainEqual({
      id: LAYER_IDS.upper,
      opacity: 0.25,
    });
    expect(viewport.colourChanges).toContainEqual({
      id: LAYER_IDS.upper,
      colour: "#ff8800",
    });
    expect(viewport.placementChanges).toEqual([]);
    const placed = viewport.transformChanges.filter(
      (change) => change.id === LAYER_IDS.upper,
    );
    expect(placed.at(-1)?.transform).not.toBeNull();
    expect(viewport.separationFactors.at(-1)).toBe(0.45);

    // The controls show what was remembered, too.
    expect(opacitySlider(root, 0).value).toBe("25");
    expect(separationSlider(root).value).toBe("45");
  });

  it("gives an unknown layer the defaults rather than someone else\u2019s settings", async () => {
    const { app, viewport, store } = createTestApp();
    store.files = exportBundleFiles();
    store.view = {
      separation: 0,
      layers: {
        "other-case/UpperJaw.stl": {
          visible: false,
          opacity: 0.1,
          colour: "#000000",
          placedByMatrix: true,
        },
      },
    };

    await app.restore();

    expect(viewport.layers).toHaveLength(3);
    expect(viewport.visibilityChanges.every((change) => change.visible)).toBe(
      true,
    );
    expect(
      viewport.transformChanges.every((change) => change.transform === null),
    ).toBe(true);
  });

  it("keeps the files and the view when a bundle is loaded", async () => {
    const { app, store } = createTestApp();

    await app.loadFiles(EXPORT_FILES);

    expect(store.files?.map((file) => file.path)).toContain(LAYER_IDS.upper);
    expect(store.view?.layers[LAYER_IDS.upper]?.colour).toBeDefined();
  });

  it("remembers a setting as soon as it is changed", async () => {
    const { app, viewport, store, root } = createTestApp();
    await app.loadFiles(EXPORT_FILES);

    const slider = opacitySlider(root, 0);
    slider.value = "30";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();

    expect(viewport.opacityChanges).toContainEqual({
      id: LAYER_IDS.upper,
      opacity: 0.3,
    });
    expect(store.view?.layers[LAYER_IDS.upper]?.opacity).toBe(0.3);
  });

  it("brings the camera back where it was left, instead of re-framing", async () => {
    const { app, viewport, store } = createTestApp();
    const camera = { position: [10, -40, 25], target: [1, 2, 3] } as const;
    store.files = exportBundleFiles();
    store.view = { separation: 0, layers: {}, camera };

    await app.restore();

    expect(viewport.cameraChanges).toEqual([camera]);
    expect(viewport.frameCount).toBe(0);
  });

  it("frames the bundle when there is no camera to bring back", async () => {
    const { app, viewport, store } = createTestApp();
    store.files = exportBundleFiles();

    await app.restore();

    expect(viewport.frameCount).toBe(1);
    expect(viewport.cameraChanges).toEqual([]);
  });

  it("stores where the camera ended up, when it settles", async () => {
    const harness = createTestApp();
    await harness.app.loadFiles(EXPORT_FILES);

    // What the viewport reports once an orbit or a zoom has finished.
    harness.settleCamera({ position: [5, 5, 50], target: [0, 0, 5] });
    await Promise.resolve();

    const saved = harness.store.view;
    expect(saved?.camera).toEqual({ position: [5, 5, 50], target: [0, 0, 5] });
  });

  it("says the session is being kept", async () => {
    const { app, root } = createTestApp();

    await app.loadFiles(EXPORT_FILES);

    expect(storageText(root)).toContain("Kept for your next visit");
  });

  it("starts empty when nothing was kept", async () => {
    const { app, viewport, root } = createTestApp();

    await app.restore();

    expect(viewport.layers).toEqual([]);
    expect(root.querySelector(".empty")?.hasAttribute("hidden")).toBe(false);
    expect(root.querySelector(".storage")?.hasAttribute("hidden")).toBe(true);
  });

  it("still shows the bundle when it could not be kept, and says why", async () => {
    const { app, viewport, store, root } = createTestApp();
    store.fileSaveFailure = "the quota was exceeded";

    await app.loadFiles(EXPORT_FILES);

    expect(viewport.layers).toHaveLength(3);
    expect(statusText(root)).toContain("Loaded 3 layers");
    expect(storageText(root)).toContain("Not kept: the quota was exceeded");
  });

  it("starts without a session when the kept one cannot be read", async () => {
    const { app, viewport, store, root } = createTestApp();
    store.readFailure = "the database is unavailable";

    await app.restore();

    expect(viewport.layers).toEqual([]);
    expect(root.querySelector(".empty")?.hasAttribute("hidden")).toBe(false);
    expect(storageText(root)).toContain("Not kept");
  });

  it("forgets the whole session, view and all, when asked", async () => {
    const { app, viewport, store, root } = createTestApp();
    await app.loadFiles(EXPORT_FILES);

    await app.forget();

    expect(store.forgetCount).toBe(1);
    expect(store.files).toBeNull();
    expect(store.view).toBeNull();
    expect(viewport.layers).toEqual([]);
    expect(root.querySelector(".empty")?.hasAttribute("hidden")).toBe(false);
    expect(root.querySelector(".storage")?.hasAttribute("hidden")).toBe(true);
    expect(statusText(root)).toBe("Forgot the kept bundle.");
  });

  it("offers a Forget control only while something is kept", async () => {
    const { app, root } = createTestApp();
    const forgetButton =
      root.querySelector<HTMLButtonElement>(".storage__forget");
    expect(forgetButton?.hidden).toBe(true);

    await app.loadFiles(EXPORT_FILES);
    expect(forgetButton?.hidden).toBe(false);

    await app.forget();
    expect(root.querySelector(".storage")?.hasAttribute("hidden")).toBe(true);
  });
});
