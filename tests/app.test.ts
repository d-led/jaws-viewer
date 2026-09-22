// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { binaryStl } from "./fixtures";
import {
  createTestApp,
  exportFiles,
  fileFrom,
  statusText,
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
});
