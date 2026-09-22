import { createApp, type App } from "../src/ui/app";
import type { BundleFile } from "../src/io/bundle-file";
import type { CameraView } from "../src/domain/view-settings";
import {
  asciiStl,
  binaryStl,
  matrix4Xml,
  textBytes,
  PROJECT_XML,
} from "./fixtures";
import { FakeSessionStore } from "./fake-session-store";
import { FakeViewport } from "./fake-viewport";

export const MATRIX_ENTRIES = [
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 30, 0, -22.5, 1,
];

/** The names every test bundle uses, so layer ids are stable across a test file. */
export const LAYER_IDS = {
  upper: "Case-UpperJaw.stl",
  lower: "Case-LowerJaw.stl",
  total: "Case-TotalJaw0.stl",
} as const;

/** A small export: two binary scans, a text scan, the case metadata and the transform. */
function exportContents(): ReadonlyArray<{
  name: string;
  bytes: Uint8Array | string;
}> {
  return [
    { name: "Case.dentalProject", bytes: PROJECT_XML },
    { name: "Case.matrix4", bytes: matrix4Xml(MATRIX_ENTRIES) },
    { name: LAYER_IDS.upper, bytes: binaryStl(12) },
    { name: LAYER_IDS.lower, bytes: binaryStl(7) },
    { name: LAYER_IDS.total, bytes: asciiStl(5) },
  ];
}

/** The export the way a file picker hands it over. */
export function exportFiles(): File[] {
  return exportContents().map((entry) => fileFrom(entry.name, entry.bytes));
}

/** The same export the way it comes back out of storage. */
export function exportBundleFiles(): readonly BundleFile[] {
  return exportContents().map((entry) => ({
    path: entry.name,
    bytes:
      typeof entry.bytes === "string" ? textBytes(entry.bytes) : entry.bytes,
  }));
}

export function fileFrom(name: string, bytes: Uint8Array | string): File {
  const content = typeof bytes === "string" ? textBytes(bytes) : bytes;
  const buffer = new ArrayBuffer(content.byteLength);
  new Uint8Array(buffer).set(content);
  return new File([buffer], name);
}

export interface AppHarness {
  readonly app: App;
  readonly viewport: FakeViewport;
  readonly store: FakeSessionStore;
  readonly root: HTMLElement;
  /** Simulates the viewport reporting that the camera has stopped moving. */
  settleCamera(view: CameraView): void;
}

export function createTestApp(): AppHarness {
  const viewport = new FakeViewport();
  const store = new FakeSessionStore();
  const root = document.createElement("div");
  document.body.append(root);

  let cameraSettled: (() => void) | undefined;
  const app = createApp(root, {
    createViewport: (_canvas, options) => {
      cameraSettled = options.onCameraSettled;
      return viewport;
    },
    store,
  });

  return {
    app,
    viewport,
    store,
    root,
    settleCamera(camera) {
      viewport.setCamera(camera);
      cameraSettled?.();
    },
  };
}

export function statusText(root: HTMLElement): string {
  return root.querySelector(".status")?.textContent ?? "";
}

export function storageText(root: HTMLElement): string {
  return root.querySelector(".storage")?.textContent ?? "";
}

export function opacitySlider(
  root: HTMLElement,
  index: number,
): HTMLInputElement {
  const slider =
    root.querySelectorAll<HTMLInputElement>(".layer__opacity")[index];
  if (slider === undefined)
    throw new Error(`No opacity slider at index ${index}.`);
  return slider;
}

export function separationSlider(root: HTMLElement): HTMLInputElement {
  const slider = root.querySelector<HTMLInputElement>(".separation__slider");
  if (slider === null) throw new Error("Expected a separation slider.");
  return slider;
}
