// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VISIBLE_MS, createToast } from "../src/ui/toast";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a message over the model", () => {
  it("says nothing until there is something to say", () => {
    const toast = createToast();

    expect(toast.element.hidden).toBe(true);
  });

  it("shows what it is told, and takes it away again", () => {
    const toast = createToast();

    toast.show("Orbit centre set");

    expect(toast.element.hidden).toBe(false);
    expect(toast.element.textContent).toBe("Orbit centre set");

    vi.advanceTimersByTime(VISIBLE_MS);

    expect(toast.element.hidden).toBe(true);
  });

  it("gives a message that arrives while another is up its own time on screen", () => {
    const toast = createToast();

    toast.show("first");
    vi.advanceTimersByTime(VISIBLE_MS - 1);
    toast.show("second");

    // The first message's clock would have run out by now; the second message's has not.
    vi.advanceTimersByTime(1);
    expect(toast.element.hidden).toBe(false);
    expect(toast.element.textContent).toBe("second");

    // And when the second message's own time is up, it goes.
    vi.advanceTimersByTime(VISIBLE_MS - 1);
    expect(toast.element.hidden).toBe(true);
  });
});
