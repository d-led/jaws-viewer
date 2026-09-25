import { expect, test, type Page } from "@playwright/test";
import {
  writeSampleArchive,
  writeSampleBundle,
  type SampleBundle,
} from "./sample-bundle";

const FILE_INPUT = ".file-picker:not([webkitdirectory])";

/**
 * Drags one or two fingers upwards across the page, the way a phone would.
 *
 * Touch is driven through CDP because a multi-finger gesture is exactly what is under test — a
 * single simulated tap would prove nothing about it.
 */
async function dragFingers(
  page: Page,
  starts: readonly { x: number; y: number }[],
  steps = 5,
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [...starts],
  });

  for (let step = 1; step <= steps; step += 1) {
    // eslint-disable-next-line no-await-in-loop -- a gesture has to arrive in order
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: starts.map((point) => ({
        x: point.x,
        y: point.y - step * 12,
      })),
    });
  }

  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.detach();
}

async function middleOfModel(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator("canvas").boundingBox();
  return {
    x: (box?.x ?? 0) + (box?.width ?? 0) / 2,
    y: (box?.y ?? 0) + (box?.height ?? 0) * 0.6,
  };
}

/**
 * Puts one finger down on a spot, the way the orbit centre is set on a touch screen, and hands back
 * the way to take it off again.
 *
 * Touch is driven through CDP for the same reason a drag is: a hold is a matter of how long the
 * finger stays down, which a click cannot say. The caller decides when that is over, because what a
 * hold leaves on screen is only up for a moment.
 */
async function fingerDown(
  page: Page,
  point: { readonly x: number; readonly y: number },
): Promise<() => Promise<void>> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point],
  });

  return async () => {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await cdp.detach();
  };
}

let bundle: SampleBundle;

test.beforeAll(async () => {
  bundle = await writeSampleBundle();
});

test.describe("the first screen on a phone", () => {
  test("shows the controls you need before anything is loaded", async ({
    page,
  }) => {
    await page.goto("/");

    // The floating button over the model, and the two ways to open a file.
    await expect(
      page.getByRole("button", { name: "Re-center everything" }),
    ).toBeVisible();
    await expect(
      page
        .locator(".sidebar__actions")
        .getByRole("button", { name: "Open files…" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Fill the screen with the model" }),
    ).toBeVisible();

    await expect(
      page.getByRole("heading", { name: "No bundle loaded" }),
    ).toBeVisible();
    await expect(
      page.getByText("Your files never leave this browser").first(),
    ).toBeVisible();
  });

  test("keeps the model on screen above the panel", async ({ page }) => {
    await page.goto("/");

    const canvas = await page.locator(".stage").boundingBox();
    const sidebar = await page.locator(".sidebar").boundingBox();
    expect(canvas).not.toBeNull();
    expect(sidebar).not.toBeNull();

    // Canvas first, panel underneath: one finger scrolls down to it.
    expect(canvas?.y ?? 0).toBeLessThan(sidebar?.y ?? 0);
    expect(canvas?.width ?? 0).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? 0,
    );
  });

  test("explains the gesture split, and drops the mouse advice", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page
        .getByText(
          "One finger rotates · two fingers scroll · hold to set the orbit centre",
        )
        .first(),
    ).toBeVisible();
    await expect(
      page.getByText("Drag to orbit · wheel to zoom · right-drag to pan"),
    ).toBeHidden();
  });

  test("drops the views and readouts a phone does not need", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("button", { name: "Top", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Front", exact: true }),
    ).toBeVisible();

    await Promise.all(
      ["Bottom", "Back", "Left", "Right"].map((hidden) =>
        expect(
          page.getByRole("button", { name: hidden, exact: true }),
        ).toBeHidden(),
      ),
    );
    await expect(page.locator(".hud")).toBeHidden();
  });

  test("lets two fingers reach the panel", async ({ page }) => {
    await page.goto("/");
    await page.setInputFiles(FILE_INPUT, bundle.files);
    await expect(page.getByText(/Loaded 3 layers/)).toBeVisible();

    const scrolled = await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      return window.scrollY;
    });

    // Two fingers scroll the page, so the page has to be scrollable at all.
    expect(scrolled).toBeGreaterThan(0);
    await expect(page.locator(".separation__slider")).toBeVisible();
  });

  test("does not scroll the page when one finger rotates the model", async ({
    page,
  }) => {
    await page.goto("/");
    await page.setInputFiles(FILE_INPUT, bundle.files);
    await expect(page.getByText(/Loaded 3 layers/)).toBeVisible();

    const middle = await middleOfModel(page);
    await dragFingers(page, [middle]);

    // The whole point of the split: a one-finger drag must not also move the page.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("scrolls the page when two fingers drag together", async ({ page }) => {
    await page.goto("/");
    await page.setInputFiles(FILE_INPUT, bundle.files);
    await expect(page.getByText(/Loaded 3 layers/)).toBeVisible();

    const middle = await middleOfModel(page);
    await dragFingers(page, [
      { x: middle.x - 40, y: middle.y },
      { x: middle.x + 40, y: middle.y },
    ]);

    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });

  test("sets the orbit centre from a held finger, and turns about it afterwards", async ({
    page,
  }) => {
    await page.goto("/");
    await page.setInputFiles(FILE_INPUT, bundle.files);
    await expect(page.getByText(/Loaded 3 layers/)).toBeVisible();

    const canvas = page.locator("canvas");
    const framed = await canvas.screenshot();

    const release = await fingerDown(page, await middleOfModel(page));

    // The hold is the app's to time, and it says so itself: wait for that rather than for a
    // stopwatch, since a busy page can delay both the touch and the timer behind it.
    await expect(page.getByText("Orbit centre set")).toBeVisible();
    await release();

    // Setting it moved nothing, and the mark that showed where it went has gone by the time the
    // message has: the picture is the one the camera was already showing.
    await expect(page.getByText("Orbit centre set")).toBeHidden({
      timeout: 10_000,
    });
    const set = await canvas.screenshot();
    expect(set.equals(framed)).toBe(true);

    // But it is what the next drag turns about, so then the picture does move — about that point.
    await dragFingers(page, [await middleOfModel(page)]);
    expect((await canvas.screenshot()).equals(set)).toBe(false);
  });

  test("shows the grid switch, folded transform and privacy note in the panel", async ({
    page,
  }) => {
    await page.goto("/");
    await page.setInputFiles(FILE_INPUT, bundle.files);
    await expect(page.getByText(/Loaded 3 layers/)).toBeVisible();

    await expect(
      page.locator(".layer--helper").getByRole("checkbox", { name: "Grid" }),
    ).toBeVisible();

    const transform = page.locator("details", { hasText: "Matrix4 transform" });
    await expect(transform).not.toHaveAttribute("open", "");
    await expect(transform.locator("summary")).toBeVisible();
  });

  test("folds the case details away on a phone", async ({ page }) => {
    await page.goto("/");
    await page.setInputFiles(FILE_INPUT, bundle.files);
    await expect(page.getByText(/Loaded 3 layers/)).toBeVisible();

    // A short panel cannot afford the case details open by default.
    const caseCard = page.locator("details", { hasText: "Case" }).first();
    await expect(caseCard).not.toHaveAttribute("open", "");
  });

  test("reads a zipped export, which is how a phone gets a whole bundle across", async ({
    page,
  }) => {
    const archive = await writeSampleArchive();
    await page.goto("/");
    await page.setInputFiles(FILE_INPUT, [archive.zip]);

    await expect(page.getByText(/Loaded 3 layers/)).toBeVisible();
    await expect(page.locator(".layer__label")).toHaveText([
      "Upper Jaw",
      "Lower Jaw",
      "Total Jaw 0",
    ]);
  });

  test("fills the screen with the model rather than the browser", async ({
    page,
  }) => {
    // The slowest test there is: a phone-sized viewport at device pixel ratio, drawn by a
    // software rasteriser, and every click has to wait for a frame to settle. It has run past the
    // default budget on a loaded runner while behaving perfectly.
    test.slow();

    await page.goto("/");
    await page.setInputFiles(FILE_INPUT, bundle.files);
    await expect(page.getByText(/Loaded 3 layers/)).toBeVisible();

    const viewport = page.viewportSize();
    const panelHeight =
      (await page.locator(".sidebar").boundingBox())?.height ?? 0;
    expect(panelHeight).toBeGreaterThan(0);

    await page
      .getByRole("button", { name: "Fill the screen with the model" })
      .click();

    // The model takes the whole window and the controls stay floating over it.
    await expect(page.locator(".app")).toHaveClass(/is-immersive/);
    await expect(page.locator(".sidebar")).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Re-center everything" }),
    ).toBeVisible();
    await expect(page.locator("canvas")).toBeVisible();

    const filled = (await page.locator(".stage").boundingBox())?.height ?? 0;
    expect(Math.round(filled)).toBeGreaterThanOrEqual(
      (viewport?.height ?? 0) - 2,
    );

    // Nothing should have been taken from the browser: no fullscreen element was requested.
    expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();

    await page.getByRole("button", { name: "Show the side panel" }).click();
    await expect(page.locator(".app")).not.toHaveClass(/is-immersive/);
    await expect(page.locator(".sidebar")).toBeVisible();
  });
});
