import type { DentalBundle } from "../domain/dental-bundle";
import { UNKNOWN_PROJECT, type DentalProject } from "../domain/dental-project";
import { translationOf, type Matrix4Entries } from "../domain/matrix4";
import type { ScanLayer } from "../domain/scan-layer";
import { formatCompact, formatCount } from "../support/format";
import { checkbox, el } from "./dom";
import type { ViewController } from "./view-controller";

/** A layer the `.matrix4` transform can be ticked for, and whether it currently is. */
export interface MatrixTarget {
  readonly id: string;
  readonly label: string;
  readonly placedByMatrix: boolean;
}

export interface MetadataPanel {
  /** The case details, kept apart from the transform so the two can sit in different places. */
  readonly caseElement: HTMLElement;
  readonly matrixElement: HTMLElement;
  show(bundle: DentalBundle, targets: readonly MatrixTarget[]): void;
}

/** Matches the layout breakpoint in the stylesheet. */
const NARROW_SCREEN = "(max-width: 44rem)";

/**
 * The `Case` and `Matrix4 transform` cards.
 *
 * Nothing starts placed by the transform. Measured against a real export, the scans ship
 * already registered against one another — the `TotalJaw` pieces sit on the jaw surfaces to
 * within a fraction of a millimetre in raw scan space — and applying the matrix moves them
 * 13–32 mm out of the mouth instead of into place. The ticks exist to inspect what it does.
 */
export function createMetadataPanel(controller: ViewController): MetadataPanel {
  const project = el("div", { class: "stack" });
  const matrix = el("div", { class: "stack" });

  // The case is reference material and the transform is an advanced control, so both fold away —
  // and on a phone, where the panel is short, the case starts folded too.
  const caseElement = disclosure("Case", project, !isNarrowScreen());
  const matrixElement = disclosure("Matrix4 transform", matrix, false);

  return {
    caseElement,
    matrixElement,
    show(bundle, targets) {
      // An export with no project file is described as an unknown case rather than a missing
      // one, so nothing below has to keep asking whether there is a project at all.
      showProject(project, bundle.project ?? UNKNOWN_PROJECT, bundle.scans);
      showMatrix(matrix, bundle.matrix, targets, controller);
    },
  };
}

function disclosure(
  title: string,
  body: HTMLElement,
  open: boolean,
): HTMLElement {
  return el(
    "details",
    { class: "card disclosure", attrs: open ? { open: "" } : {} },
    [el("summary", { class: "disclosure__summary", text: title }), body],
  );
}

function isNarrowScreen(): boolean {
  return window.matchMedia(NARROW_SCREEN).matches;
}

function showProject(
  container: HTMLElement,
  project: DentalProject,
  scans: readonly ScanLayer[],
): void {
  const rows: Array<readonly [string, string | null]> = [
    ["Patient", describe(project.patient.name, project.patient.id)],
    ["Practice", describe(project.practice.name, project.practice.id)],
    ["Tray", project.trayNumber],
    ["Tooth colour", project.toothColour],
    ["Antagonist", project.antagonistType],
    ["Movement markers", describeBoolean(project.movementMarkerScan)],
    ["Created", project.createdAt],
    ["Layers", scans.length === 0 ? null : String(scans.length)],
    ["Triangles", describeTriangles(scans)],
  ];

  const children: HTMLElement[] = [definitionList(rows)];
  if (project.notes !== null) children.push(notesBlock(project.notes));
  container.replaceChildren(...children);
}

function notesBlock(notes: string): HTMLElement {
  return el("div", { class: "notes" }, [
    el("span", { class: "notes__caption", text: "Notes" }),
    el("pre", { class: "notes__body", text: notes }),
  ]);
}

function showMatrix(
  container: HTMLElement,
  matrix: Matrix4Entries | null,
  targets: readonly MatrixTarget[],
  controller: ViewController,
): void {
  if (matrix === null) {
    container.replaceChildren(
      el("p", { class: "hint", text: "No .matrix4 file in this bundle." }),
    );
    return;
  }

  const [x, y, z] = translationOf(matrix);

  container.replaceChildren(
    el(
      "div",
      { class: "matrix__grid" },
      matrix.map((value) =>
        el("span", { class: "matrix__cell", text: formatCompact(value) }),
      ),
    ),
    el("p", {
      class: "hint",
      text: `Translation ${formatCompact(x)}, ${formatCompact(y)}, ${formatCompact(z)} mm, from the file's last row.`,
    }),
    el(
      "div",
      { class: "stack stack--tight" },
      targets.map((target) =>
        checkbox({
          class: "matrix__target",
          label: target.label,
          title: "Place this layer with the .matrix4 transform",
          checked: target.placedByMatrix,
          onChange: (checked) => controller.setLayerPlaced(target.id, checked),
        }),
      ),
    ),
    el("p", {
      class: "hint",
      text: "Tick a layer to place it with this transform. The scans ship already registered, so none start ticked.",
    }),
  );
}

function definitionList(
  rows: readonly (readonly [string, string | null])[],
): HTMLElement {
  const items: HTMLElement[] = [];
  for (const [term, value] of rows) {
    if (value === null) continue;
    items.push(
      el("dt", { class: "facts__term", text: term }),
      el("dd", { class: "facts__value", text: value }),
    );
  }
  return el("dl", { class: "facts" }, items);
}

/** `Test Patient (173)`, or whichever of the two the export carried. */
function describe(name: string | null, id: string | null): string | null {
  if (isBlank(name)) return isBlank(id) ? null : id;
  return isBlank(id) ? name : `${name} (${id})`;
}

function describeBoolean(value: boolean | null): string | null {
  if (value === null) return null;
  return value ? "Yes" : "No";
}

function isBlank(value: string | null): boolean {
  return value === null || value === "";
}

function describeTriangles(scans: readonly ScanLayer[]): string | null {
  const total = scans.reduce((sum, scan) => sum + (scan.triangleCount ?? 0), 0);
  return total === 0 ? null : formatCount(total);
}
