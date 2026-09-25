import { expect, type Page } from "@playwright/test";

/**
 * The camera the viewer has written to IndexedDB, and the reading of it.
 *
 * All of these are about what the app *stored* rather than what it painted: a stored view says more
 * than a screenshot, and a screenshot of a canvas that is still drawing waits for an element that
 * will never hold still.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads the view the app has written to IndexedDB.
 *
 * Finding a setting has to be waited for rather than assumed: the write is asynchronous, and a
 * reload that beats it would look like a bug when it is only a race in the test.
 */
export async function storedView(page: Page): Promise<unknown> {
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
export function storedOpacities(stored: unknown): number[] {
  if (!isRecord(stored)) return [];

  const { layers } = stored;
  if (!isRecord(layers)) return [];

  return Object.values(layers).flatMap((layer) => {
    if (!isRecord(layer)) return [];
    const { opacity } = layer;
    return typeof opacity === "number" ? [opacity] : [];
  });
}

export type Triple = readonly [number, number, number];

/** The camera as the app stores it: where it stands, what it looks at, and what it turns about. */
export interface StoredCamera {
  readonly position: Triple;
  readonly target: Triple;
  readonly orbitCentre: Triple;
}

/** The three numbers a stored position or target holds, or nothing when it is not one. */
export function tripleOf(stored: unknown): Triple | null {
  if (!Array.isArray(stored)) return null;

  const [x, y, z] = stored as readonly unknown[];
  return typeof x === "number" && typeof y === "number" && typeof z === "number"
    ? [x, y, z]
    : null;
}

/** The camera out of a stored view, or nothing when nothing is stored yet. */
export function storedCamera(stored: unknown): StoredCamera | null {
  if (!isRecord(stored)) return null;

  const { camera } = stored;
  if (!isRecord(camera)) return null;

  const position = tripleOf(camera["position"]);
  const target = tripleOf(camera["target"]);
  if (position === null || target === null) return null;

  // A view stored before the centre was the user's to move settles for what the camera looks at.
  return {
    position,
    target,
    orbitCentre: tripleOf(camera["orbitCentre"]) ?? target,
  };
}

/** The camera the app has stored, waited for: a write that has not landed yet is not a failure. */
export async function settledCamera(page: Page): Promise<StoredCamera> {
  await expect
    .poll(async () => storedCamera(await storedView(page)))
    .not.toBeNull();

  const camera = storedCamera(await storedView(page));
  if (camera === null) throw new Error("Expected the view to be stored.");

  return camera;
}

/**
 * How far the camera sits from what it is looking at, read out of a stored view.
 *
 * A reframe changes this before it changes anything else, and it is one number rather than six,
 * which is all a test needs to say "the view was left alone". Nought when nothing is stored yet.
 */
export function cameraDistance(stored: unknown): number {
  const camera = storedCamera(stored);
  return camera === null
    ? 0
    : Math.round(shiftBetween(camera.position, camera.target));
}

/** How far apart two stored positions are, in the millimetres the model is measured in. */
export function shiftBetween(from: Triple, to: Triple): number {
  const [x, y, z] = differences(from, to);

  return Math.hypot(x, y, z);
}

/** One stored triple taken away from another. */
export function differences(from: Triple, to: Triple): Triple {
  return [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
}

/**
 * How far the point the camera turns about is from the middle of what it is looking at, in radians.
 *
 * How far off the middle of the screen it appears, in other words, since the camera looks at what it
 * looks at: turning about that point has to leave this exactly as it was.
 */
export function bearingOf(camera: StoredCamera): number {
  const [ax, ay, az] = differences(camera.position, camera.target);
  const [bx, by, bz] = differences(camera.position, camera.orbitCentre);
  const [looked, toCentre] = [Math.hypot(ax, ay, az), Math.hypot(bx, by, bz)];
  const cosine = (ax * bx + ay * by + az * bz) / (looked * toCentre);

  return Math.acos(Math.min(Math.max(cosine, -1), 1));
}
