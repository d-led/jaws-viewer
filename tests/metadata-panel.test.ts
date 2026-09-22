// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { DentalBundle } from "../src/domain/dental-bundle";
import { UNKNOWN_PROJECT } from "../src/domain/dental-project";
import type { Matrix4Entries } from "../src/domain/matrix4";
import type { ScanKind, ScanLayer } from "../src/domain/scan-layer";
import {
  createMetadataPanel,
  type MatrixTarget,
} from "../src/ui/metadata-panel";
import { FakeViewport } from "./fake-viewport";

const TRANSFORM = [
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 30, 0, -22.5, 1,
] as const satisfies Matrix4Entries;

function scan(id: string, label: string, kind: ScanKind): ScanLayer {
  return {
    id,
    fileName: `${id}.stl`,
    label,
    kind,
    triangleCount: 100,
    stl: new ArrayBuffer(84),
  };
}

const UPPER = scan("upper", "Upper Jaw", "upper");
const TOTAL_0 = scan("total0", "Total Jaw 0", "total");

function bundleWith(
  matrix: Matrix4Entries | null,
  ...scans: readonly ScanLayer[]
): DentalBundle {
  return {
    project: {
      ...UNKNOWN_PROJECT,
      createdAt: "2026-09-02T08:42:50",
      trayNumber: "173",
      toothColour: "A1",
      notes: "Line one\nLine two",
      patient: { id: "173", name: "Test Patient" },
      practice: { id: "003", name: "Dr. Example" },
    },
    matrix,
    scans,
    skipped: [],
  };
}

function targetsFor(...placed: readonly string[]): MatrixTarget[] {
  return [UPPER, TOTAL_0].map((layer) => ({
    id: layer.id,
    label: layer.label,
    placedByMatrix: placed.includes(layer.id),
  }));
}

function bodyOf(card: HTMLElement): HTMLElement {
  return card.querySelector<HTMLElement>(".stack") ?? card;
}

function panelWith(
  bundle: DentalBundle,
  targets: readonly MatrixTarget[] = targetsFor(),
) {
  const controller = new FakeViewport();
  const panel = createMetadataPanel(controller);
  panel.show(bundle, targets);

  return {
    controller,
    /** The case card, which folds away. */
    caseBody: bodyOf(panel.caseElement),
    /** The transform card: folded by default, and placed at the bottom by the app. */
    matrixCard: panel.matrixElement,
    matrixBody: bodyOf(panel.matrixElement),
  };
}

function tickBoxes(element: HTMLElement): HTMLInputElement[] {
  return [
    ...element.querySelectorAll<HTMLInputElement>(".matrix__target input"),
  ];
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined)
    throw new Error(`Expected an element at index ${index}.`);
  return item;
}

function tick(box: HTMLInputElement, checked: boolean): void {
  box.checked = checked;
  box.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("the case panel", () => {
  it("names the patient and the practice, with their identifiers", () => {
    const { caseBody } = panelWith(bundleWith(null, UPPER));

    expect(caseBody.textContent).toContain("Test Patient (173)");
    expect(caseBody.textContent).toContain("Dr. Example (003)");
    expect(caseBody.textContent).toContain("2026-09-02T08:42:50");
  });

  it("keeps the sending practice\u2019s multi-line note", () => {
    const { caseBody } = panelWith(bundleWith(null, UPPER));

    expect(caseBody.querySelector(".notes__body")?.textContent).toBe(
      "Line one\nLine two",
    );
  });

  it("leaves out the fields the export did not carry", () => {
    const { caseBody } = panelWith(bundleWith(null, UPPER));

    expect(caseBody.textContent).not.toContain("Movement markers");
  });
});

describe("the transform panel", () => {
  it("folds away, so the everyday controls stay on screen", () => {
    const { matrixCard } = panelWith(bundleWith(TRANSFORM, UPPER));

    expect(matrixCard.tagName).toBe("DETAILS");
    expect(matrixCard.hasAttribute("open")).toBe(false);
  });

  it("shows all sixteen entries and the translation they encode", () => {
    const { matrixBody } = panelWith(bundleWith(TRANSFORM, UPPER));

    expect(matrixBody.querySelectorAll(".matrix__cell")).toHaveLength(16);
    expect(matrixBody.textContent).toContain("Translation 30, 0, -22.5 mm");
  });

  it("shows a tick per layer, reflecting whether the transform is applied", () => {
    const { matrixBody } = panelWith(
      bundleWith(TRANSFORM, UPPER, TOTAL_0),
      targetsFor("total0"),
    );

    expect(tickBoxes(matrixBody).map((box) => box.checked)).toEqual([
      false,
      true,
    ]);
  });

  it("starts with nothing placed when nothing is remembered", () => {
    const { controller } = panelWith(bundleWith(TRANSFORM, UPPER, TOTAL_0));

    expect(controller.placementChanges).toEqual([]);
  });

  it("reports a layer being placed by the transform", () => {
    const { controller, matrixBody } = panelWith(
      bundleWith(TRANSFORM, UPPER, TOTAL_0),
    );

    tick(at(tickBoxes(matrixBody), 1), true);

    expect(controller.placementChanges).toEqual([
      { id: "total0", placed: true },
    ]);
  });

  it("reports a layer being put back where it was scanned", () => {
    const { controller, matrixBody } = panelWith(
      bundleWith(TRANSFORM, UPPER, TOTAL_0),
      targetsFor("total0"),
    );

    tick(at(tickBoxes(matrixBody), 1), false);

    expect(controller.placementChanges).toEqual([
      { id: "total0", placed: false },
    ]);
  });

  it("says so when the bundle has no transform", () => {
    const { controller, matrixBody } = panelWith(bundleWith(null, UPPER));

    expect(matrixBody.textContent).toContain("No .matrix4 file");
    expect(controller.placementChanges).toEqual([]);
  });
});
