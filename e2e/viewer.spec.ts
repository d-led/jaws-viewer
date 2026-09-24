import { expect, test, type Page } from "@playwright/test";
import {
  writeSampleArchive,
  writeSampleBundle,
  type SampleBundle,
} from "./sample-bundle";

const FILE_INPUT = ".file-picker:not([webkitdirectory])";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads the view the app has written to IndexedDB.
 *
 * Finding a setting has to be waited for rather than assumed: the write is asynchronous, and a
 * reload that beats it would look like a bug when it is only a race in the test.
 */
async function storedView(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("keyval-store");
      open.addEventListener("success", () => resolve(open.result));
      open.addEventListener("error", () =>
        reject(new Error(`opening the store failed: ${String(open.error)}`)),
      );
    });

    return new Promise<unknown>((resolve, reject) => {
      const request: IDBRequest<unknown> = database
        .transaction("keyval", "readonly")
        .objectStore("keyval")
        .get("jaws-viewer/last-view");
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () =>
        reject(new Error(`reading the view failed: ${String(request.error)}`)),
      );
    });
  });
}

/** The opacity stored for each layer, dug out of whatever shape the record happens to have. */
function storedOpacities(stored: unknown): number[] {
  if (!isRecord(stored)) return [];

  const { layers } = stored;
  if (!isRecord(layers)) return [];

  return Object.values(layers).flatMap((layer) => {
    if (!isRecord(layer)) return [];
    const { opacity } = layer;
    return typeof opacity === "number" ? [opacity] : [];
  });
}

/**
 * How far the camera sits from what it is looking at, read out of a stored view.
 *
 * A reframe changes this before it changes anything else, and it is one number rather than six,
 * which is all a test needs to say "the view was left alone". Nought when nothing is stored yet.
 */
function cameraDistance(stored: unknown): number {
  if (!isRecord(stored)) return 0;

  const { camera } = stored;
  if (!isRecord(camera)) return 0;

  const position = camera["position"];
  const target = camera["target"];
  if (!Array.isArray(position) || !Array.isArray(target)) return 0;

  const distances = position.map((value, axis) => value - target[axis]);
  if (distances.some((value) => typeof value !== "number")) return 0;

  return Math.round(Math.hypot(...distances));
}

let bundle: SampleBundle;

test.beforeAll(async () => {
  bundle = await writeSampleBundle();
});

test.describe("a first visit", () => {
  test("invites you to open something, and says your files stay put", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "No bundle loaded" }),
    ).toBeVisible();
    // Stated in the empty state and in the footer, so take the first.
    await expect(
      page.getByText("Your files never leave this browser").first(),
    ).toBeVisible();
    await expect(page.locator("canvas")).toBeVisible();
  });

  test("keeps the transform folded away", async ({ page }) => {
    await page.goto("/");

    const transform = page.locator("details", { hasText: "Matrix4 transform" });
    await expect(transform).toBeVisible();
    await expect(transform).not.toHaveAttribute("open", "");
  });
});

test.describe("loading an export", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.setInputFiles(FILE_INPUT, bundle.files);
    await expect(page.getByText(/Loaded 3 layers/)).toBeVisible();
  });

  test("lists every scan it understood, and nothing else", async ({ page }) => {
    await expect(page.locator(".layer__label")).toHaveText([
      "Upper Jaw",
      "Lower Jaw",
      "Total Jaw 0",
    ]);
  });

  test("counts the triangles it drew", async ({ page }) => {
    // Three 12-triangle boxes.
    await expect(page.locator(".layer__meta").first()).toHaveText(
      "12 triangles",
    );
  });

  test("reads the case details out of the project file", async ({ page }) => {
    const details = page.locator("details", { hasText: "Case" }).first();

    // Folded or not, the details are in the document.
    await expect(details).toContainText(bundle.patientName);
    await expect(details).toContainText("DigitalImpressionScan");
  });

  test("shows the transform when it is unfolded", async ({ page }) => {
    const transform = page.locator("details", { hasText: "Matrix4 transform" });
    await transform.locator("summary").click();

    await expect(transform.locator(".matrix__cell")).toHaveCount(16);
    await expect(
      transform.getByText(/Translation 30, 0, -22.5 mm/),
    ).toBeVisible();
  });

  test("fades a layer and reports how far", async ({ page }) => {
    const layer = page.locator(".layer").first();
    await layer.locator(".layer__opacity").fill("40");

    await expect(layer.locator(".layer__opacity-value")).toHaveText("40%");
  });

  test("hides a layer", async ({ page }) => {
    const first = page.locator(".layer").first();
    await first.locator(".layer__visibility").uncheck();

    await expect(first.locator(".layer__visibility")).not.toBeChecked();
  });

  test("soloes a layer, and brings the rest back", async ({ page }) => {
    const solo = page.getByRole("button", { name: "Solo" }).first();

    await solo.click();
    await expect(solo).toHaveAttribute("aria-pressed", "true");

    await solo.click();
    await expect(solo).toHaveAttribute("aria-pressed", "false");
  });

  test("switches the grid from the layer list", async ({ page }) => {
    const grid = page
      .locator(".layer--helper")
      .getByRole("checkbox", { name: "Grid" });

    await expect(grid).toBeChecked();
    await grid.uncheck();
    await expect(grid).not.toBeChecked();
  });

  test("opens the bite with the separation slider", async ({ page }) => {
    await page.locator(".separation__slider").fill("60");

    await expect(page.locator(".separation__value")).toHaveText("60%");
  });

  test("re-centers with the button over the model", async ({ page }) => {
    const recenter = page.getByRole("button", { name: "Re-center everything" });
    await expect(recenter).toBeVisible();

    // Should be a no-op that does not break the view.
    await recenter.click();
    await expect(page.locator("canvas")).toBeVisible();
  });

  test("snaps to an axis view", async ({ page }) => {
    await page.getByRole("button", { name: "Top", exact: true }).click();

    await expect(page.locator("canvas")).toBeVisible();
  });

  test("leaves the view where the user put it when the surface changes", async ({
    page,
  }) => {
    const canvas = await page.locator("canvas").boundingBox();
    await page.mouse.move(
      (canvas?.x ?? 0) + (canvas?.width ?? 0) / 2,
      (canvas?.y ?? 0) + (canvas?.height ?? 0) / 2,
    );

    const framed = cameraDistance(await storedView(page));
    expect(framed).toBeGreaterThan(0);

    await page.mouse.wheel(0, -600);
    await expect
      .poll(async () => cameraDistance(await storedView(page)))
      .not.toBe(framed);
    const zoomed = cameraDistance(await storedView(page));

    await page.locator(".layer__surface").first().selectOption("mean");
    await expect(page.getByText(/curvature ready/)).toBeVisible();

    // Switching the surface is no reason to pull the camera back: the zoom stays where it was.
    expect(cameraDistance(await storedView(page))).toBe(zoomed);
  });
});

test.describe("filling the screen", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.setInputFiles(FILE_INPUT, bundle.files);
    await expect(page.getByText(/Loaded 3 layers/)).toBeVisible();
  });

  test("keeps the view inside the window it is shown in", async ({ page }) => {
    // A canvas left in the layout stretches the stage to the size of its own drawing buffer,
    // and then the model is framed for a viewport nobody can see: off-centre, and off the
    // bottom of the screen. The stage follows the window, and the canvas follows the stage.
    const viewport = page.viewportSize();
    const stageHeight = async (): Promise<number> =>
      Math.round((await page.locator(".stage").boundingBox())?.height ?? 0);

    expect(await stageHeight()).toBeLessThanOrEqual(viewport?.height ?? 0);

    const canvas = await page.locator("canvas").boundingBox();
    expect(Math.round(canvas?.height ?? 0)).toBe(await stageHeight());

    // Resizing is where this went wrong: the view used to grow with it and never come back.
    await page.setViewportSize({ width: 700, height: 900 });
    await expect.poll(stageHeight).toBeLessThanOrEqual(900);
  });

  test("leaves with Escape, which the exit control advertises", async ({
    page,
  }) => {
    await page
      .getByRole("button", { name: "Fill the screen with the model" })
      .click();
    await expect(page.locator(".app")).toHaveClass(/is-immersive/);

    const exit = page.getByRole("button", { name: "Show the side panel" });
    await expect(exit).toHaveAttribute("aria-keyshortcuts", "Escape");
    await expect(exit).toHaveAttribute("title", "Show the side panel");

    await page.keyboard.press("Escape");

    await expect(page.locator(".app")).not.toHaveClass(/is-immersive/);
    await expect(page.locator(".sidebar")).toBeVisible();
  });

  test("puts a highlighted exit control in the top left", async ({ page }) => {
    await page
      .getByRole("button", { name: "Fill the screen with the model" })
      .click();

    const exit = page.getByRole("button", { name: "Show the side panel" });
    const box = await exit.boundingBox();
    const stage = await page.locator(".stage").boundingBox();

    expect(box?.x ?? 0).toBeLessThan((stage?.x ?? 0) + (stage?.width ?? 0) / 2);
    expect(box?.y ?? 0).toBeLessThan(
      (stage?.y ?? 0) + (stage?.height ?? 0) / 2,
    );

    // Highlighted rather than neutral, because it floats over the model.
    const backgroundOf = (locator: typeof exit): Promise<string> =>
      locator.evaluate((element) => getComputedStyle(element).backgroundColor);
    const neutral = page.getByRole("button", { name: "Re-center everything" });

    expect(await backgroundOf(exit)).not.toBe(await backgroundOf(neutral));
  });
});

test.describe("a zipped export", () => {
  test("is unpacked as it arrives", async ({ page }) => {
    const archive = await writeSampleArchive();
    await page.goto("/");
    await page.setInputFiles(FILE_INPUT, [archive.zip]);

    await expect(page.getByText(/Loaded 3 layers/)).toBeVisible();
    await expect(page.locator(".layer__label")).toHaveText([
      "Upper Jaw",
      "Lower Jaw",
      "Total Jaw 0",
    ]);

    // The metadata came from inside the archive too, not just the meshes.
    await expect(
      page.locator("details", { hasText: "Case" }).first(),
    ).toContainText(bundle.patientName);
  });

  test("is recognised by what it contains, not by what it is called", async ({
    page,
  }) => {
    const archive = await writeSampleArchive();
    await page.goto("/");
    await page.setInputFiles(FILE_INPUT, [archive.misnamed]);

    await expect(page.getByText(/Loaded 3 layers/)).toBeVisible();
    await expect(page.locator(".layer__label")).toHaveCount(3);
  });
});

test.describe("the sample bundle", () => {
  test("loads from the empty state, with no files to hand", async ({
    page,
  }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Load sample" }).click();

    await expect(page.getByText(/Loaded 4 layers/)).toBeVisible();
    await expect(page.locator(".layer__label")).toHaveText([
      "Upper Jaw",
      "Lower Jaw",
      "Total Jaw 0",
      "Total Jaw 1",
    ]);

    // The case file inside the sample gets read like any other.
    await expect(
      page.locator("details", { hasText: "Case" }).first(),
    ).toContainText("Sample Patient");
  });

  test("is offered only while there is nothing loaded to look at", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Load sample" }).click();
    await expect(page.getByText(/Loaded 4 layers/)).toBeVisible();

    // Once a bundle is up there is nothing left to try out, so the offer goes with the
    // empty state — even though opening a different bundle stays on offer above it.
    await expect(
      page.getByRole("button", { name: "Load sample" }),
    ).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Open files…" }),
    ).toBeVisible();
  });

  test("carries its own provenance", async ({ page }) => {
    const response = await page.request.get("/sample/README.md");

    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain("Generated, not scanned");
  });
});

test.describe("coming back", () => {
  test("brings the bundle and the settings back after a reload", async ({
    page,
  }) => {
    await page.goto("/");
    await page.setInputFiles(FILE_INPUT, bundle.files);
    await expect(page.getByText(/Loaded 3 layers/)).toBeVisible();

    const first = page.locator(".layer").first();
    await first.locator(".layer__opacity").fill("40");
    await expect(first.locator(".layer__opacity-value")).toHaveText("40%");

    // Wait for the setting to actually be stored before reloading.
    await expect
      .poll(async () => storedOpacities(await storedView(page)).includes(0.4))
      .toBe(true);

    await page.reload();

    await expect(page.getByText(/Restored from your last visit/)).toBeVisible();
    await expect(page.locator(".layer__label")).toHaveCount(3);
    await expect(
      page.locator(".layer").first().locator(".layer__opacity"),
    ).toHaveValue("40");
  });

  test("forgets everything when asked", async ({ page }) => {
    await page.goto("/");
    await page.setInputFiles(FILE_INPUT, bundle.files);
    await expect(page.getByText(/Loaded 3 layers/)).toBeVisible();

    await page.getByRole("button", { name: "Forget the kept bundle" }).click();

    await expect(page.getByText("Forgot the kept bundle.")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "No bundle loaded" }),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("heading", { name: "No bundle loaded" }),
    ).toBeVisible();
  });
});
