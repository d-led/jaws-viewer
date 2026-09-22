import { EMPTY_BUNDLE, type DentalBundle } from "../domain/dental-bundle";
import type { Matrix4Entries } from "../domain/matrix4";
import type { ScanKind } from "../domain/scan-layer";
import {
  EMPTY_VIEW_SETTINGS,
  defaultLayerSettings,
  gridIsVisible,
  keepingLayers,
  layerSettingsIn,
  withGridVisible,
  withLayerSettings,
  withSeparation,
  type LayerSettings,
  type ViewSettings,
} from "../domain/view-settings";
import { readBundle } from "../io/bundle-reader";
import type { BundleFile } from "../io/bundle-file";
import { readDroppedFiles, readFileList } from "../io/drop-reader";
import { readSampleBundle } from "../io/sample-bundle";
import type { SessionStore } from "../io/session-store";
import { errorMessage } from "../support/errors";
import { formatCount } from "../support/format";
import type { Viewport, ViewportOptions } from "../viewer/viewport";
import { button, el, iconButton } from "./dom";
import { installDropTarget } from "./drop-target";
import { createImmersiveMode } from "./immersive";
import { createLayersPanel, type LayerView } from "./layers-panel";
import { createMetadataPanel, type MatrixTarget } from "./metadata-panel";
import { defaultColour } from "./palette";
import { createSeparationControl } from "./separation-control";
import { createStorageNotice } from "./storage-notice";
import type { ViewController } from "./view-controller";
import { createViewToolbar } from "./view-toolbar";

/** The parts of the UI a caller can drive, which is also what a test needs. */
export interface App {
  loadFiles(files: readonly File[]): Promise<void>;
  loadFromDrop(transfer: DataTransfer): Promise<void>;
  /** Brings back the session kept from an earlier visit; does nothing when there is none. */
  restore(): Promise<void>;
  /** Forgets the kept session and returns to the empty state. */
  forget(): Promise<void>;
}

export type ViewportFactory = (
  canvas: HTMLCanvasElement,
  options: ViewportOptions,
) => Viewport;

export interface AppOptions {
  readonly createViewport: ViewportFactory;
  readonly store: SessionStore;
}

export function createApp(root: HTMLElement, options: AppOptions): App {
  const { createViewport, store } = options;

  const canvas = el("canvas", { class: "stage__canvas" });
  const status = el("p", { class: "status", attrs: { role: "status" } });
  const hud = el("div", { class: "hud", text: "No layers loaded" });
  const overlay = el("div", { class: "drop-overlay" }, [
    el("p", { class: "drop-overlay__title", text: "Drop to open" }),
    el("p", {
      class: "drop-overlay__hint",
      text: "Loose .stl scans, the export folder, or a .zip of it",
    }),
  ]);
  // Says how to move the model on a touch screen, where one finger is taken by scrolling.
  const touchHint = el("p", { class: "touch-hint", text: TOUCH_HINT });

  const viewport = createViewport(canvas, {
    onStats: (stats) => {
      hud.textContent = `${formatCount(stats.visibleTriangles)} triangles · ${stats.fps} fps · ${stats.drawCalls} draws`;
    },
    // Orbiting changes nothing a control describes, so the camera has to say so itself.
    onCameraSettled: () => remember(),
  });

  /** How the bundle is being looked at — the one description the surface is driven from. */
  let settings: ViewSettings = EMPTY_VIEW_SETTINGS;
  /** The export's `.matrix4` placement, which the ticked layers are moved by. */
  let matrix: Matrix4Entries | null = null;

  const controller: ViewController = {
    setLayerVisible: (id, visible) =>
      update(withLayerSettings(settings, id, { visible })),
    setLayerOpacity: (id, opacity) =>
      update(withLayerSettings(settings, id, { opacity })),
    setLayerColour: (id, colour) =>
      update(withLayerSettings(settings, id, { colour })),
    isolate: (id) => viewport.isolate(id),
    setLayerPlaced: (id, placed) =>
      update(withLayerSettings(settings, id, { placedByMatrix: placed })),
    setSeparation: (factor) => update(withSeparation(settings, factor)),
    setGridVisible: (visible) => update(withGridVisible(settings, visible)),
  };

  const layers = createLayersPanel(controller);
  const metadata = createMetadataPanel(controller);
  const separation = createSeparationControl(controller);
  const storage = createStorageNotice({ onForget: () => void forget() });

  function report(message: string, tone: "info" | "error" = "info"): void {
    status.textContent = message;
    status.dataset["tone"] = tone;
  }

  /** Pushes the settings at the 3D surface. */
  function applySettings(view: ViewSettings): void {
    for (const [id, layer] of Object.entries(view.layers)) {
      viewport.setLayerVisible(id, layer.visible);
      viewport.setLayerOpacity(id, layer.opacity);
      viewport.setLayerColour(id, layer.colour);
      viewport.setLayerTransform(id, layer.placedByMatrix ? matrix : null);
    }
    viewport.setSeparation(view.separation);
    viewport.setGridVisible(gridIsVisible(view));
  }

  /**
   * Takes an edited view as the new truth, and remembers it.
   *
   * The panels are not re-rendered here: while a control is being dragged, its own widget is what
   * should be on screen, and rebuilding it mid-drag would fight the user.
   */
  function update(next: ViewSettings): void {
    if (next === settings) return;
    settings = next;
    applySettings(settings);
    remember();
  }

  /**
   * Stores how things are being looked at, camera included.
   *
   * The camera is read from the viewport rather than held in `settings`: it changes on every
   * orbit frame and nothing in the panels describes it.
   */
  function remember(): void {
    void store.saveView(snapshot()).catch((error: unknown) => {
      storage.showFailure(errorMessage(error));
    });
  }

  function snapshot(): ViewSettings {
    return { ...settings, camera: viewport.getCamera() };
  }

  /** Replaces what is on screen with `bundle`, looked at the way `view` describes. */
  function showBundle(
    bundle: DentalBundle,
    view: ViewSettings,
    lead = "",
  ): void {
    viewport.clearLayers();
    matrix = bundle.matrix;

    const kindCounts = new Map<ScanKind, number>();
    const views: LayerView[] = [];
    const failures: string[] = [];
    const resolved: Record<string, LayerSettings> = {};

    for (const scan of bundle.scans) {
      const indexWithinKind = kindCounts.get(scan.kind) ?? 0;
      kindCounts.set(scan.kind, indexWithinKind + 1);

      const layerSettings = layerSettingsIn(
        view,
        scan.id,
        defaultLayerSettings(defaultColour(scan.kind, indexWithinKind)),
      );

      const outcome = viewport.addLayer({
        id: scan.id,
        label: scan.label,
        colour: layerSettings.colour,
        stl: scan.stl,
      });
      if (!outcome.ok) {
        failures.push(`${scan.fileName} (${outcome.reason})`);
        continue;
      }

      resolved[scan.id] = layerSettings;
      views.push({
        id: scan.id,
        label: scan.label,
        kind: scan.kind,
        triangleCount: scan.triangleCount,
        settings: layerSettings,
      });
    }

    // Carry settings only for the layers that made it in, so ids from other bundles are dropped.
    settings = keepingLayers(view, resolved);
    applySettings(settings);

    layers.show(views, gridIsVisible(settings));
    metadata.show(bundle, views.map(toMatrixTarget));
    separation.show(settings.separation);

    // A remembered camera is what the user last saw; without one, frame the bundle.
    if (view.camera === null || view.camera === undefined) viewport.fitAll();
    else viewport.setCamera(view.camera);

    empty.hidden = views.length > 0;

    const summary = summarise(bundle, views, failures);
    report(
      lead === "" ? summary : `${lead} · ${summary}`,
      views.length === 0 ? "error" : "info",
    );
  }

  /** Empties the view, for when there is nothing loaded after all. */
  function clear(): void {
    viewport.clearLayers();
    matrix = null;
    settings = EMPTY_VIEW_SETTINGS;
    layers.show([], gridIsVisible(settings));
    metadata.show(EMPTY_BUNDLE, []);
    separation.show(0);
    empty.hidden = false;
    hud.textContent = "No layers loaded";
  }

  async function loadFiles(files: readonly File[]): Promise<void> {
    await load(() => readFileList(files));
  }

  async function loadFromDrop(transfer: DataTransfer): Promise<void> {
    await load(() => readDroppedFiles(transfer));
  }

  async function loadSample(): Promise<void> {
    await load(readSampleBundle);
  }

  async function load(
    read: () => Promise<readonly BundleFile[]>,
  ): Promise<void> {
    report("Reading files…");

    let files: readonly BundleFile[];
    try {
      files = await read();
    } catch (error) {
      report(`Could not read the files: ${errorMessage(error)}`, "error");
      return;
    }

    if (files.length === 0) {
      report("Nothing was dropped or picked.", "error");
      return;
    }

    // Layer settings follow the layer, so dropping the same export again brings them back.
    // Opening the bite is something done to one model, so a new load starts assembled.
    showBundle(readBundle(files), withSeparation(settings, 0));
    await keep(files);
  }

  async function keep(files: readonly BundleFile[]): Promise<void> {
    try {
      await store.saveFiles(files);
      await store.saveView(snapshot());
      storage.showSaved();
    } catch (error) {
      storage.showFailure(errorMessage(error));
    }
  }

  async function restore(): Promise<void> {
    let files: readonly BundleFile[] | null;
    let view: ViewSettings | null;
    try {
      files = await store.readFiles();
      view = await store.readView();
    } catch (error) {
      storage.showFailure(errorMessage(error));
      return;
    }

    if (files === null || files.length === 0) return;

    // The file bytes are already stored, so this must not write them back.
    showBundle(
      readBundle(files),
      view ?? EMPTY_VIEW_SETTINGS,
      "Restored from your last visit",
    );
    storage.showSaved();
  }

  async function forget(): Promise<void> {
    try {
      await store.forget();
    } catch (error) {
      storage.showFailure(errorMessage(error));
      return;
    }

    storage.showNothing();
    clear();
    report("Forgot the kept bundle.");
  }

  const filePicker = createFilePicker(
    "files",
    (files) => void loadFiles(Array.from(files)),
  );
  const folderPicker = createFilePicker(
    "folder",
    (files) => void loadFiles(Array.from(files)),
  );
  const foldersPickable = canPickFolders();

  const empty = el("div", { class: "empty" }, [
    el("h2", { class: "empty__title", text: "No bundle loaded" }),
    el("p", {
      class: "empty__hint",
      text: foldersPickable ? DESKTOP_HINT : MOBILE_HINT,
    }),
    el("p", { class: "empty__privacy", text: PRIVACY_NOTE }),
    el("div", { class: "empty__actions" }, [
      button("Open files…", () => filePicker.click(), {
        class: "button button--blue",
        title: "Choose STL, .dentalProject and .matrix4 files",
      }),
      ...(foldersPickable
        ? [
            button("Open folder…", () => folderPicker.click(), {
              class: "button button--yellow",
              title:
                "Choose the whole export folder — a .zip goes through Open files…",
            }),
          ]
        : []),
      button("Load sample", () => void loadSample(), {
        class: "button button--green",
        title: "A small bundle generated for this viewer, with no patient data",
      }),
    ]),
  ]);

  // Loading a different bundle stays on offer at all times; trying the sample does not, because
  // it is only of interest while there is nothing loaded to look at. It lives in the empty state.
  const actions = el("div", { class: "sidebar__actions" }, [
    iconButton("files", "Open files…", () => filePicker.click(), {
      class: "button button--icon button--blue",
    }),
    ...(foldersPickable
      ? [
          iconButton("folder", "Open folder…", () => folderPicker.click(), {
            class: "button button--icon button--yellow",
            title:
              "Choose the whole export folder — a .zip goes through Open files…",
          }),
        ]
      : []),
  ]);

  const stage = el("main", { class: "stage" }, [
    canvas,
    createViewToolbar(viewport),
    hud,
    touchHint,
    empty,
  ]);

  const element = el("div", { class: "app" }, [
    el("aside", { class: "sidebar" }, [
      el("header", { class: "brand" }, [
        el("h1", { class: "brand__title", text: "Jaw Scan Viewer" }),
        el("p", { class: "brand__hint", text: "Aoralscan / exocad exports" }),
      ]),
      actions,
      status,
      storage.element,
      metadata.caseElement,
      layers.element,
      separation.element,
      metadata.matrixElement,
      el("footer", { class: "sidebar__footer" }, [
        el("p", { class: "hint", text: PRIVACY_NOTE }),
        el("p", {
          class: "hint hint--mouse",
          text: "Drag to orbit · wheel to zoom · right-drag to pan",
        }),
        el("p", {
          class: "hint hint--touch",
          text: TOUCH_HINT,
        }),
      ]),
    ]),
    stage,
    filePicker,
    folderPicker,
    overlay,
  ]);

  root.replaceChildren(element);

  // Filling the screen needs the elements it fills, so it is wired once they exist.
  actions.append(createImmersiveMode({ app: element, stage }).toggle);

  // The hint has done its job once a two-finger gesture has been used.
  canvas.addEventListener("touchstart", (event) => {
    if (event.touches.length >= 2) touchHint.hidden = true;
  });

  installDropTarget({
    target: element,
    overlay,
    onDrop: (transfer) => void loadFromDrop(transfer),
  });

  return { loadFiles, loadFromDrop, restore, forget };
}

/** Shown in the UI, because scan bundles are patient data. */
export const PRIVACY_NOTE =
  "Your files never leave this browser: nothing is uploaded, and there is no tracking.";

/**
 * The gesture split for a touch screen: the model answers to one finger and nothing else, and
 * two fingers are given to the page — the reverse of an embedded map, because here the model is
 * the point rather than a decoration on a page.
 */
export const TOUCH_HINT = "One finger rotates · two fingers scroll";

const DESKTOP_HINT =
  "Drop the export folder, its files, or a .zip of it anywhere on this page.";

/**
 * A phone has no folder drop and no folder picker, so a zipped export is the way to bring a
 * whole bundle across.
 */
const MOBILE_HINT =
  "Pick the export files, or a .zip of the folder — zipping it in the Files app is the quickest way.";

/**
 * `webkitdirectory` is unsupported on iOS and Android, where it is quietly ignored.
 *
 * Asking for a folder there would produce a broken promise, so the control is left out and the
 * empty state points at the route that does work.
 */
function canPickFolders(): boolean {
  return "webkitdirectory" in document.createElement("input");
}

function toMatrixTarget(view: LayerView): MatrixTarget {
  return {
    id: view.id,
    label: view.label,
    placedByMatrix: view.settings.placedByMatrix,
  };
}

function createFilePicker(
  kind: "files" | "folder",
  onPicked: (files: FileList) => void,
): HTMLInputElement {
  const browseFor: Record<string, string> =
    kind === "files" ? { multiple: "" } : { webkitdirectory: "" };

  return el("input", {
    class: "file-picker",
    attrs: { type: "file", ...browseFor },
    on: {
      change: (event) => {
        if (
          event.target instanceof HTMLInputElement &&
          event.target.files !== null
        ) {
          onPicked(event.target.files);
        }
      },
    },
  });
}

function summarise(
  bundle: DentalBundle,
  views: readonly LayerView[],
  failures: readonly string[],
): string {
  const problems = [
    ...failures.map((failure) => `could not display ${failure}`),
    ...bundle.skipped.map((file) => `skipped ${file}`),
  ];

  if (views.length === 0) {
    return problems.length === 0
      ? "No scans found in that selection. A .zip opens through Open files…, or by dropping it on the page."
      : `No scans found — ${problems.join(", ")}.`;
  }

  const triangles = views.reduce(
    (sum, view) => sum + (view.triangleCount ?? 0),
    0,
  );
  const loaded =
    `Loaded ${views.length} layer${views.length === 1 ? "" : "s"}` +
    (triangles === 0 ? "" : ` · ${formatCount(triangles)} triangles`);
  return problems.length === 0 ? loaded : `${loaded} — ${problems.join(", ")}.`;
}
