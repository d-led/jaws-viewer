import { Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FLASH_MS,
  createOrbitCentreMarker,
} from "../src/viewer/orbit-centre-marker";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the mark that says where the orbit centre went", () => {
  it("is out of the way until there is a centre to mark", () => {
    expect(createOrbitCentreMarker().object.visible).toBe(false);
  });

  it("flashes on the centre, small against what it is marking", () => {
    const marker = createOrbitCentreMarker();

    marker.flash(new Vector3(3, 4, 5), 100);

    expect(marker.object.visible).toBe(true);
    expect(marker.object.position.toArray()).toEqual([3, 4, 5]);

    // A dot beside a 100 mm model: a millimetre or two across, not a ball the size of the jaw.
    const radius = marker.object.scale.x;
    expect(radius).toBeGreaterThan(0.5);
    expect(radius).toBeLessThan(5);
  });

  it("goes away again by itself", () => {
    const marker = createOrbitCentreMarker();

    marker.flash(new Vector3(), 100);
    vi.advanceTimersByTime(FLASH_MS);

    expect(marker.object.visible).toBe(false);
  });

  it("gives a centre set while another is still marked its own flash", () => {
    const marker = createOrbitCentreMarker();

    marker.flash(new Vector3(1, 1, 1), 100);
    vi.advanceTimersByTime(FLASH_MS - 1);
    marker.flash(new Vector3(0, 0, -5), 100);

    // The first centre's clock would have run out by now; the second one's has not.
    vi.advanceTimersByTime(1);
    expect(marker.object.visible).toBe(true);
    expect(marker.object.position.toArray()).toEqual([0, 0, -5]);

    vi.advanceTimersByTime(FLASH_MS - 1);
    expect(marker.object.visible).toBe(false);
  });
});
