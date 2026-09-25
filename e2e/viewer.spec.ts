import { expect, test, type Page } from "@playwright/test";
import {
  writeSampleArchive,
  writeSampleBundle,
  type SampleBundle,
} from "./sample-bundle";
import {
  bearingOf,
  cameraDistance,
  settledCamera,
  shiftBetween,
  storedCamera,
  storedOpacities,
  storedView,
} from "./stored-view";

const FILE_INPUT = ".file-picker:not([webkitdirectory])";

/**
 * How long to hold a button down: well past what the app waits for, so that its own clock is what
 * decides whether a hold happened.
 */
const HOLD_MS = 1500;

/**
 * Holds the button down on a spot, which is how the orbit centre is set.
 *
 * Generous rather than exact on purpose: software WebGL draws slowly, and input and timers can both
 * be queued behind it, so a test that raced the app's own hold would fail on a busy machine.
 */
async function holdButton(
  page: Page,
  point: { readonly x: number; readonly y: number },
): Promise<void> {
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.waitForTimeout(HOLD_MS);
  await page.mouse.up();
}

/**
 * Drags a button across the canvas: the left one turns the model, and the right one pans it.
 *
 * In steps, because a turn arrives as the pointer moves rather than as one jump.
 */
async function dragAcross(
  page: Page,
  from: { readonly x: number; readonly y: number },
  dx: number,
  button: "left" | "right" = "left",
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button });
  await page.mouse.move(from.x + dx, from.y, { steps: 5 });
  await page.mouse.up({ button });
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

  test("sets the orbit centre from a held button, leaving the view alone", async ({
    page,
  }) => {
    const framed = await settledCamera(page);

    const canvas = await page.locator("canvas").boundingBox();
    // Away from the middle of the model, where a preparation die or a tooth would be.
    await holdButton(page, {
      x: (canvas?.x ?? 0) + (canvas?.width ?? 0) * 0.4,
      y: (canvas?.y ?? 0) + (canvas?.height ?? 0) * 0.68,
    });

    await expect(page.getByText("Orbit centre set")).toBeVisible();
    await expect
      .poll(async () => storedCamera(await storedView(page))?.orbitCentre)
      .not.toEqual(framed.orbitCentre);

    const held = await settledCamera(page);

    // Nothing has moved. The point a later turn goes round is all that has changed, which is why
    // setting it is silent apart from the mark that says where it is.
    expect(shiftBetween(framed.position, held.position)).toBeLessThan(0.001);
    expect(shiftBetween(framed.target, held.target)).toBeLessThan(0.001);
  });

  test("turns about the point that was set, and moves nothing else", async ({
    page,
  }) => {
    const canvas = await page.locator("canvas").boundingBox();
    const held = {
      x: (canvas?.x ?? 0) + (canvas?.width ?? 0) * 0.4,
      y: (canvas?.y ?? 0) + (canvas?.height ?? 0) * 0.68,
    };
    await holdButton(page, held);
    await expect(page.getByText("Orbit centre set")).toBeVisible();

    const set = await settledCamera(page);

    await dragAcross(page, held, 240);

    const turned = await settledCamera(page);

    // It turned: the camera stands somewhere else, and looks somewhere else.
    expect(shiftBetween(set.position, turned.position)).toBeGreaterThan(1);

    // About that point: the camera is as far from it as it was, and the point has not moved across
    // the screen, which is what it means to turn about it.
    expect(shiftBetween(set.orbitCentre, turned.orbitCentre)).toBeLessThan(
      0.001,
    );
    expect(shiftBetween(turned.position, turned.orbitCentre)).toBeCloseTo(
      shiftBetween(set.position, set.orbitCentre),
      3,
    );
    expect(bearingOf(turned)).toBeCloseTo(bearingOf(set), 6);
  });

  test("keeps the point it turns about when the model is panned", async ({
    page,
  }) => {
    const canvas = await page.locator("canvas").boundingBox();
    await holdButton(page, {
      x: (canvas?.x ?? 0) + (canvas?.width ?? 0) * 0.4,
      y: (canvas?.y ?? 0) + (canvas?.height ?? 0) * 0.68,
    });
    await expect(page.getByText("Orbit centre set")).toBeVisible();

    const set = await settledCamera(page);

    await dragAcross(
      page,
      {
        x: (canvas?.x ?? 0) + (canvas?.width ?? 0) / 2,
        y: (canvas?.y ?? 0) + (canvas?.height ?? 0) / 2,
      },
      120,
      "right",
    );

    const panned = await settledCamera(page);

    // Panning moves the view, and the point the camera turns about stays where the user put it.
    expect(shiftBetween(set.position, panned.position)).toBeGreaterThan(1);
    expect(shiftBetween(set.orbitCentre, panned.orbitCentre)).toBeLessThan(
      0.001,
    );
  });

  test("puts the point it turns about back in the middle when it is re-centered", async ({
    page,
  }) => {
    const canvas = await page.locator("canvas").boundingBox();
    await holdButton(page, {
      x: (canvas?.x ?? 0) + (canvas?.width ?? 0) * 0.4,
      y: (canvas?.y ?? 0) + (canvas?.height ?? 0) * 0.68,
    });
    await expect(page.getByText("Orbit centre set")).toBeVisible();

    await page.getByRole("button", { name: "Re-center everything" }).click();

    await expect
      .poll(async () => {
        const view = storedCamera(await storedView(page));
        if (view === null) return Number.POSITIVE_INFINITY;
        return shiftBetween(view.orbitCentre, view.target);
      })
      .toBeLessThan(0.001);
  });

  test("leaves the view alone when a held button finds no model under it", async ({
    page,
  }) => {
    const framed = await settledCamera(page);

    const canvas = await page.locator("canvas").boundingBox();
    // The top left corner of the view: the background, with the model framed inside it.
    await holdButton(page, {
      x: (canvas?.x ?? 0) + 8,
      y: (canvas?.y ?? 0) + 8,
    });

    // Nothing was found, so nothing is said, and the centre stays where it was. `OrbitControls`
    // rebuilds the camera position from its spherical coordinates every frame, so "where it was" is
    // to within the last bit of the arithmetic rather than to the digit.
    await expect(page.getByText("Orbit centre set")).toBeHidden();

    const untouched = await settledCamera(page);
    expect(shiftBetween(framed.position, untouched.position)).toBeLessThan(
      0.001,
    );
    expect(shiftBetween(framed.target, untouched.target)).toBeLessThan(0.001);

    // And the same hold on the model does move it, so the quiet above was the press finding nothing
    // rather than the hold never landing at all.
    await holdButton(page, {
      x: (canvas?.x ?? 0) + (canvas?.width ?? 0) / 2,
      y: (canvas?.y ?? 0) + (canvas?.height ?? 0) * 0.6,
    });

    await expect(page.getByText("Orbit centre set")).toBeVisible();
    await expect
      .poll(async () => storedCamera(await storedView(page))?.orbitCentre)
      .not.toEqual(framed.orbitCentre);
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
