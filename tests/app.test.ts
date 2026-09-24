// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { binaryStl } from "./fixtures";
import {
  createTestApp,
  exportFiles,
  fileFrom,
  smoothingSlider,
  statusText,
  surfaceSelect,
  LAYER_IDS,
} from "./app-harness";

const EXPORT_FILES = exportFiles();

/** A file as it arrives from a folder pick, with the relative path the browser sets. */
function inFolder(name: string, bytes: Uint8Array | string): File {
  const file = fileFrom(name, bytes);
  Object.defineProperty(file, "webkitRelativePath", {
    value: `123_123_Example Practice/${name}`,
  });
  return file;
}

function separationSlider(root: HTMLElement): HTMLInputElement {
  const slider = root.querySelector<HTMLInputElement>(".separation__slider");
  if (slider === null) throw new Error("Expected a separation slider.");
  return slider;
}

/** The colour scale beside a layer's surface control. */
function surfaceLegend(root: HTMLElement, index: number): HTMLElement {
  const legend = root.querySelectorAll<HTMLElement>(".layer__legend")[index];
  if (legend === undefined) throw new Error(`No legend at index ${index}.`);
  return legend;
}

describe("the viewer application", () => {
  it("offers the kinds of file an export is made of in the dialog", () => {
    const { root } = createTestApp();

    const picker = root.querySelector<HTMLInputElement>(
      'input[type="file"]:not([webkitdirectory])',
    );

    expect(picker?.accept.split(",")).toEqual(
      expect.arrayContaining([
        ".zip",
        ".stl",
        ".dentalProject",
        ".matrix4",
        ".xml",
      ]),
    );
  });

  it("adds a layer for every scan in the bundle", async () => {
    const { app, viewport } = createTestApp();

    await app.loadFiles(EXPORT_FILES);

    expect(viewport.layers.map((layer) => layer.label)).toEqual([
      "Upper Jaw",
      "Lower Jaw",
      "Total Jaw 0",
    ]);
  });

  it("gives each layer a colour of its own", async () => {
    const { app, viewport } = createTestApp();

    await app.loadFiles(EXPORT_FILES);

    const colours = viewport.layers.map((layer) => layer.colour);
    expect(new Set(colours).size).toBe(colours.length);
  });

  it("frames everything it just loaded", async () => {
    const { app, viewport } = createTestApp();

    await app.loadFiles(EXPORT_FILES);

    expect(viewport.frameCount).toBe(1);
  });

  it("replaces the previous bundle rather than piling layers up", async () => {
    const { app, viewport } = createTestApp();
    await app.loadFiles(EXPORT_FILES);
    viewport.clearCount = 0;

    await app.loadFiles([fileFrom("Other-UpperJaw.stl", binaryStl(2))]);

    expect(viewport.clearCount).toBe(1);
    expect(viewport.layers.map((layer) => layer.label)).toEqual(["Upper Jaw"]);
  });

  it("reports how much it loaded", async () => {
    const { app, root } = createTestApp();

    await app.loadFiles(EXPORT_FILES);

    expect(statusText(root)).toMatch(/Loaded 3 layers/);
    expect(statusText(root)).toMatch(/triangles/);
  });

  it("names the files it had to skip, without losing the scans", async () => {
    const { app, viewport, root } = createTestApp();

    await app.loadFiles([...EXPORT_FILES, fileFrom("readme.md", "# hello")]);

    expect(viewport.layers).toHaveLength(3);
    expect(statusText(root)).toContain("skipped readme.md");
  });

  it("reports a file it could not display", async () => {
    const { app, viewport, root } = createTestApp();
    viewport.failAddLayer = true;

    await app.loadFiles([fileFrom("Case-UpperJaw.stl", binaryStl(12))]);

    expect(statusText(root)).toContain("could not display Case-UpperJaw.stl");
  });

  it("says when a selection held no scans at all", async () => {
    const { app, root } = createTestApp();

    await app.loadFiles([fileFrom("readme.md", "# hello")]);

    expect(statusText(root)).toMatch(/No scans found/);
  });

  it("takes a whole folder of files", async () => {
    const { app, viewport } = createTestApp();

    await app.loadFiles([
      inFolder(
        "Case.dentalProject",
        "<Treatment><TrayNo>7</TrayNo></Treatment>",
      ),
      inFolder("Case-UpperJaw.stl", binaryStl(12)),
      inFolder("Case-LowerJaw.stl", binaryStl(7)),
    ]);

    expect(viewport.layers.map((layer) => layer.label)).toEqual([
      "Upper Jaw",
      "Lower Jaw",
    ]);
    expect(viewport.layers[0]?.id).toBe(
      "123_123_Example Practice/Case-UpperJaw.stl",
    );
  });

  it("shows the empty state until something is loaded", async () => {
    const { app, root } = createTestApp();
    const empty = root.querySelector(".empty");
    expect(empty).not.toBeNull();
    expect(empty?.hasAttribute("hidden")).toBe(false);

    await app.loadFiles(EXPORT_FILES);

    expect(empty?.hasAttribute("hidden")).toBe(true);
  });

  it("gives every loaded layer a transparency control in the sidebar", async () => {
    const { app, root } = createTestApp();
    expect(root.querySelector(".stage__canvas")).not.toBeNull();
    expect(root.querySelectorAll(".layer__opacity")).toHaveLength(0);

    await app.loadFiles(EXPORT_FILES);

    expect(root.querySelectorAll(".layer__opacity")).toHaveLength(3);
  });

  it("opens each bundle assembled, whatever the slider was left at", async () => {
    const { app, root, viewport } = createTestApp();
    const slider = separationSlider(root);
    slider.value = "80";
    slider.dispatchEvent(new Event("input", { bubbles: true }));

    await app.loadFiles(EXPORT_FILES);

    expect(slider.value).toBe("0");
    expect(viewport.separationFactors.at(-1)).toBe(0);
  });

  it("spreads the layers apart when the separation slider moves", async () => {
    const { app, root, viewport } = createTestApp();
    await app.loadFiles(EXPORT_FILES);
    viewport.separationFactors.length = 0;

    const slider = separationSlider(root);
    slider.value = "60";
    slider.dispatchEvent(new Event("input", { bubbles: true }));

    expect(viewport.separationFactors).toEqual([0.6]);
    expect(root.querySelector(".separation__value")?.textContent).toBe("60%");
  });

  it("loads whatever the file picker hands over", async () => {
    const { viewport, root } = createTestApp();
    const picker = root.querySelector<HTMLInputElement>(".file-picker");
    expect(picker).not.toBeNull();

    // What the browser does once the user has chosen files in the dialog.
    Object.defineProperty(picker, "files", { value: EXPORT_FILES });
    picker?.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => expect(viewport.layers).toHaveLength(3));
    expect(viewport.layers.map((layer) => layer.label)).toContain("Upper Jaw");
  });

  it("loads files handed over by a drop", async () => {
    const { app, viewport } = createTestApp();
    const transfer = new DataTransfer();
    for (const file of EXPORT_FILES) transfer.items.add(file);

    await app.loadFromDrop(transfer);

    expect(viewport.layers).toHaveLength(3);
  });

  it("asks the surface for the scalar a layer is being shown by", async () => {
    const { app, root, viewport } = createTestApp();
    await app.loadFiles(EXPORT_FILES);
    viewport.surfaceChanges.length = 0;

    const select = surfaceSelect(root, 0);
    select.value = "sharpness";
    select.dispatchEvent(new Event("change", { bubbles: true }));

    // Every layer is told what to show, so the ones that were left alone keep their own colour.
    expect(viewport.surfaceChanges).toContainEqual({
      id: LAYER_IDS.upper,
      surface: "sharpness",
    });
    expect(viewport.surfaceChanges).toContainEqual({
      id: LAYER_IDS.lower,
      surface: "colour",
    });
  });

  it("asks the surface how hard to smooth a curvature", async () => {
    const { app, root, viewport } = createTestApp();
    await app.loadFiles(EXPORT_FILES);
    viewport.smoothingChanges.length = 0;

    const slider = smoothingSlider(root, 0);
    slider.value = "5";
    slider.dispatchEvent(new Event("input", { bubbles: true }));

    expect(viewport.smoothingChanges).toContainEqual({
      id: LAYER_IDS.upper,
      smoothing: 5,
    });
  });

  it("keeps the grid switched off when another bundle is loaded", async () => {
    const { app, root, viewport } = createTestApp();
    await app.loadFiles(EXPORT_FILES);

    const grid = root.querySelector<HTMLInputElement>(".layer--helper input");
    if (grid === null) throw new Error("Expected a grid switch.");
    grid.checked = false;
    grid.dispatchEvent(new Event("change", { bubbles: true }));

    await app.loadFiles(EXPORT_FILES);

    expect(viewport.gridVisible).toBe(false);
  });

  it("keeps the layer the user left on its own", async () => {
    const { app, root, viewport, store } = createTestApp();
    await app.loadFiles(EXPORT_FILES);

    const solo = root.querySelectorAll<HTMLButtonElement>(".layer__solo")[1];
    solo?.click();

    expect(viewport.isolated).toBe(LAYER_IDS.lower);
    expect(store.view?.isolated).toBe(LAYER_IDS.lower);
  });

  it("says what the surfacing is doing", () => {
    const harness = createTestApp();

    harness.reportSurface({
      id: LAYER_IDS.upper,
      label: "Upper Jaw",
      state: "measuring",
    });
    expect(statusText(harness.root)).toContain(
      "Measuring the surface of Upper Jaw",
    );

    harness.reportSurface({
      id: LAYER_IDS.upper,
      label: "Upper Jaw",
      state: "painted",
      milliseconds: 750,
      scalar: "mean",
      range: { min: -0.4, max: 0.4 },
    });
    expect(statusText(harness.root)).toContain("curvature ready in 0.8 s");
  });

  it("says what the colours on a layer mean, once it has measured them", async () => {
    const harness = createTestApp();
    await harness.app.loadFiles(EXPORT_FILES);

    harness.reportSurface({
      id: LAYER_IDS.upper,
      label: "Upper Jaw",
      state: "painted",
      milliseconds: 750,
      scalar: "mean",
      range: { min: -0.42, max: 0.42 },
    });

    const legend = surfaceLegend(harness.root, 0);
    expect(legend.hidden).toBe(false);
    expect(legend.textContent).toContain("0.42");
    expect(legend.textContent).toContain("1/mm");
  });

  it("takes the legend away when a layer goes back to its own colour", async () => {
    const harness = createTestApp();
    await harness.app.loadFiles(EXPORT_FILES);
    harness.reportSurface({
      id: LAYER_IDS.upper,
      label: "Upper Jaw",
      state: "painted",
      milliseconds: 750,
      scalar: "mean",
      range: { min: -0.42, max: 0.42 },
    });

    const select = surfaceSelect(harness.root, 0);
    select.value = "colour";
    select.dispatchEvent(new Event("change", { bubbles: true }));

    expect(surfaceLegend(harness.root, 0).hidden).toBe(true);
  });

  it("says so when a surface could not be measured", () => {
    const harness = createTestApp();

    harness.reportSurface({
      id: LAYER_IDS.upper,
      label: "Upper Jaw",
      state: "failed",
      reason: "the measuring worker stopped",
    });

    expect(statusText(harness.root)).toContain(
      "Upper Jaw: the measuring worker stopped",
    );
    expect(
      harness.root.querySelector(".status")?.getAttribute("data-tone"),
    ).toBe("error");
  });
});
