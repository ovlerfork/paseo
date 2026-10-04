import AsyncStorage from "@react-native-async-storage/async-storage";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSidebarCollapsedSectionsStore } from ".";
import {
  DEFAULT_SIDEBAR_EXPANSION_SETTINGS,
  sidebarActivity,
  type SidebarExpansionBranch,
} from "./state";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}));

const store = useSidebarCollapsedSectionsStore;
const branches = (activity: number): SidebarExpansionBranch[] => [
  { kind: "project", key: "project-a", activity },
  { kind: "projectGroup", key: "group-a", activity },
  { kind: "workspaceGroup", key: "running", activity },
  { kind: "pinned", key: "pinned", activity },
  { kind: "project", key: "project-idle", activity: 0 },
];

beforeEach(() => {
  store.getState().synchronize([]);
  store.getState().resetSettings();
});

describe("sidebar expansion", () => {
  it("collapses idle branches, opens running ancestors, and collapses them when tasks finish", () => {
    store.getState().synchronize(branches(0));
    expect(store.getState().collapsedProjectKeys).toEqual(new Set(["project-a", "project-idle"]));
    expect(store.getState().collapsedProjectGroupNames.has("group-a")).toBe(true);
    expect(store.getState().collapsedWorkspaceGroupKeys.has("running")).toBe(true);
    expect(store.getState().collapsedPinned).toBe(true);

    store.getState().synchronize(branches(sidebarActivity(["running", "needs_input"])));
    expect(store.getState().collapsedProjectKeys).toEqual(new Set(["project-idle"]));
    expect(store.getState().collapsedProjectGroupNames.size).toBe(0);
    expect(store.getState().collapsedWorkspaceGroupKeys.size).toBe(0);
    expect(store.getState().collapsedPinned).toBe(false);

    store.getState().synchronize(branches(0));
    expect(store.getState().collapsedProjectKeys.has("project-a")).toBe(true);
    expect(store.getState().collapsedPinned).toBe(true);
  });

  it("respects manual toggles while activity is unchanged and resets them on transitions", () => {
    store.getState().synchronize(branches(1));
    store.getState().toggleProjectCollapsed("project-a");
    store.getState().toggleProjectGroupCollapsed("group-a");
    store.getState().toggleWorkspaceGroupCollapsed("running");
    store.getState().togglePinnedCollapsed();
    store.getState().synchronize(branches(1));
    expect(store.getState().collapsedProjectKeys.has("project-a")).toBe(true);
    expect(store.getState().collapsedProjectGroupNames.has("group-a")).toBe(true);
    expect(store.getState().collapsedWorkspaceGroupKeys.has("running")).toBe(true);
    expect(store.getState().collapsedPinned).toBe(true);

    store.getState().synchronize(branches(0));
    store.getState().setProjectCollapsed("project-a", false);
    store.getState().synchronize(branches(0));
    expect(store.getState().collapsedProjectKeys.has("project-a")).toBe(false);
    store.getState().synchronize(branches(1));
    expect(store.getState().collapsedProjectGroupNames.has("group-a")).toBe(false);
    expect(store.getState().collapsedPinned).toBe(false);
    store.getState().synchronize(branches(0));
    expect(store.getState().collapsedProjectKeys.has("project-a")).toBe(true);
  });

  it("applies configured triggers and idle behavior immediately and restores defaults", () => {
    store.getState().synchronize(branches(sidebarActivity(["needs_input", "attention"])));
    expect(store.getState().collapsedProjectKeys.has("project-a")).toBe(true);
    store.getState().setSettings({ ...DEFAULT_SIDEBAR_EXPANSION_SETTINGS, needsInput: true });
    expect(store.getState().collapsedProjectKeys.has("project-a")).toBe(false);
    store.getState().toggleProjectCollapsed("project-a");
    store.getState().setSettings({ ...DEFAULT_SIDEBAR_EXPANSION_SETTINGS, attention: true });
    expect(store.getState().collapsedProjectKeys.has("project-a")).toBe(false);
    store.getState().setSettings({ ...DEFAULT_SIDEBAR_EXPANSION_SETTINGS, running: false });
    store.getState().synchronize(branches(1));
    expect(store.getState().collapsedProjectKeys.has("project-a")).toBe(true);
    store.getState().setSettings({ ...DEFAULT_SIDEBAR_EXPANSION_SETTINGS, idle: "expanded" });
    expect(store.getState().collapsedProjectKeys.size).toBe(0);
    store.getState().resetSettings();
    expect(store.getState().settings).toEqual(DEFAULT_SIDEBAR_EXPANSION_SETTINGS);
    expect(store.getState().collapsedProjectKeys).toEqual(new Set(["project-idle"]));
  });

  it("restores validated local settings and recalculates current sections", async () => {
    store.getState().synchronize(branches(0));
    const settings = {
      ...DEFAULT_SIDEBAR_EXPANSION_SETTINGS,
      idle: "expanded" as const,
      running: false,
    };
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(
      JSON.stringify({ state: { settings }, version: 0 }),
    );
    await store.persist.rehydrate();
    expect(store.getState().settings).toEqual(settings);
    expect(store.getState().collapsedProjectKeys.size).toBe(0);
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(
      JSON.stringify({ state: { settings: { ...settings, idle: "invalid" } }, version: 0 }),
    );
    await store.persist.rehydrate();
    expect(store.getState().settings).toEqual(settings);
  });
});
