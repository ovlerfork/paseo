import { describe, expect, it } from "vitest";
import {
  TAB_WHEEL_COOLDOWN_MS,
  createTabWheelState,
  resolveWheelTabTarget,
} from "./workspace-tab-wheel";

const tabIds = ["a", "b", "c"];

describe("resolveWheelTabTarget", () => {
  it("moves to the next tab on downward wheel and previous on upward", () => {
    const state = createTabWheelState();
    expect(
      resolveWheelTabTarget({ state, deltaX: 0, deltaY: 100, now: 1000, tabIds, activeTabId: "b" }),
    ).toBe("c");
    expect(
      resolveWheelTabTarget({
        state,
        deltaX: 0,
        deltaY: -100,
        now: 2000,
        tabIds,
        activeTabId: "b",
      }),
    ).toBe("a");
  });

  it("does not wrap past the ends", () => {
    const state = createTabWheelState();
    expect(
      resolveWheelTabTarget({ state, deltaX: 0, deltaY: 100, now: 1000, tabIds, activeTabId: "c" }),
    ).toBeNull();
    expect(
      resolveWheelTabTarget({
        state,
        deltaX: 0,
        deltaY: -100,
        now: 2000,
        tabIds,
        activeTabId: "a",
      }),
    ).toBeNull();
  });

  it("accumulates small trackpad deltas before switching", () => {
    const state = createTabWheelState();
    const step = (now: number) =>
      resolveWheelTabTarget({ state, deltaX: 0, deltaY: 15, now, tabIds, activeTabId: "a" });
    expect(step(1000)).toBeNull();
    expect(step(1010)).toBeNull();
    expect(step(1020)).toBe("b");
  });

  it("ignores events inside the cooldown", () => {
    const state = createTabWheelState();
    const input = { state, deltaX: 0, deltaY: 100, tabIds, activeTabId: "a" };
    expect(resolveWheelTabTarget({ ...input, now: 1000 })).toBe("b");
    expect(resolveWheelTabTarget({ ...input, now: 1000 + TAB_WHEEL_COOLDOWN_MS - 1 })).toBeNull();
  });

  it("uses horizontal delta when it dominates", () => {
    const state = createTabWheelState();
    expect(
      resolveWheelTabTarget({ state, deltaX: -80, deltaY: 5, now: 1000, tabIds, activeTabId: "b" }),
    ).toBe("a");
  });

  it("does nothing with fewer than two tabs", () => {
    const state = createTabWheelState();
    expect(
      resolveWheelTabTarget({
        state,
        deltaX: 0,
        deltaY: 100,
        now: 1000,
        tabIds: ["a"],
        activeTabId: "a",
      }),
    ).toBeNull();
  });
});
