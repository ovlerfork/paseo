/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type {
  SidebarProjectEntry,
  SidebarWorkspaceEntry,
  SidebarWorkspacePlacement,
} from "@/hooks/use-sidebar-workspaces-list";
import { SidebarModelProvider } from "./sidebar-model";
import { useSidebarCollapsedSectionsStore } from "@/stores/sidebar-collapsed-sections-store";
import { useSidebarViewStore } from "@/stores/sidebar-view-store";

const inputs = vi.hoisted(() => ({
  list: {},
  entries: new Map(),
  selection: { serverId: "srv", workspaceId: "selected" },
  tabId: "task-a",
  pinnedKeys: { pinnedWorkspaceKeys: [] as string[], pinnedAtByKey: {} },
  hosts: [],
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/use-sidebar-workspaces-list", () => ({
  useSidebarWorkspacesList: () => inputs.list,
}));
vi.mock("@/hooks/use-sidebar-workspace-entries", () => ({
  useSidebarWorkspaceEntries: () => inputs.entries,
}));
vi.mock("@/hooks/use-sidebar-pins", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-sidebar-pins")>()),
  usePinnedSidebarKeys: () => inputs.pinnedKeys,
}));
vi.mock("@/stores/navigation-active-workspace-store", () => ({
  useActiveWorkspaceSelection: () => inputs.selection,
}));
vi.mock("@/stores/workspace-layout-store", () => ({
  useWorkspaceLayoutStore: (selector: (state: unknown) => unknown) =>
    selector({ layoutByWorkspace: { "srv:selected": { root: {}, focusedPaneId: "main" } } }),
  findPaneById: () => ({ focusedTabId: inputs.tabId }),
}));
vi.mock("@/workspace-labels", () => ({
  useWorkspaceLabelProjection: () => ({ hosts: inputs.hosts }),
  hasAuthoritativeWorkspaceLabelCatalog: () => false,
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn(),
  },
}));
afterEach(cleanup);
function makeWorkspace(
  id: string,
  statusBucket: SidebarWorkspaceEntry["statusBucket"] = "done",
  labels: string[] = [],
  projectViewKey = "project",
) {
  const placement: SidebarWorkspacePlacement = {
    workspaceKey: `srv:${id}`,
    serverId: "srv",
    workspaceId: id,
    projectViewKey,
    projectName: "Project",
    projectKind: "git",
    workspaceKind: "worktree",
    name: id,
  };
  const entry: SidebarWorkspaceEntry = {
    ...placement,
    workspaceDirectory: "",
    workspaceDirectoryLabel: "",
    title: null,
    currentBranch: null,
    statusBucket,
    statusEnteredAt: null,
    archivingAt: null,
    diffStat: null,
    prHint: null,
    archiveHasUncommittedChanges: null,
    archiveUnpushedCommitCount: null,
    scripts: [],
    hasRunningScripts: false,
    labels,
  };
  return { placement, entry };
}

function makeProject(
  workspaces: SidebarWorkspacePlacement[],
  viewKey = "project",
): SidebarProjectEntry {
  return {
    viewKey,
    projectName: "Project",
    projectKind: "git",
    iconWorkingDir: `/repo/${viewKey}`,
    hosts: [
      {
        serverId: "srv",
        projectId: viewKey,
        iconWorkingDir: `/repo/${viewKey}`,
        worktreeSupport: "supported" as const,
      },
    ],
    workspaces,
  };
}

it("maps the viewed workspace to project ancestors, moved status groups and pinned content", () => {
  const store = useSidebarCollapsedSectionsStore;
  store.getState().synchronize([]);
  store.getState().resetSettings();
  useSidebarViewStore.setState({ groupMode: "project", projectFilters: [] });
  const selected = makeWorkspace("selected", "running");
  const project = { ...makeProject([selected.placement]), groupName: "Group" };
  inputs.list = {
    projects: [project],
    workspacePlacements: [selected.placement],
    projectNamesByViewKey: new Map([["project", "Project"]]),
  };
  inputs.entries = new Map([[selected.entry.workspaceKey, selected.entry]]);
  const view = render(
    <SidebarModelProvider>
      <span />
    </SidebarModelProvider>,
  );
  expect(store.getState().collapsedProjectKeys.has("project")).toBe(false);
  expect(store.getState().collapsedProjectGroupNames.has("Group")).toBe(false);
  inputs.entries = new Map([
    [selected.entry.workspaceKey, { ...selected.entry, statusBucket: "done" }],
  ]);
  view.rerender(
    <SidebarModelProvider>
      <span />
    </SidebarModelProvider>,
  );
  expect(store.getState().collapsedProjectKeys.has("project")).toBe(false);
  act(() => {
    store.getState().toggleProjectCollapsed("project");
  });
  expect(store.getState().collapsedProjectKeys.has("project")).toBe(true);
  inputs.tabId = "task-b";
  view.rerender(
    <SidebarModelProvider>
      <span />
    </SidebarModelProvider>,
  );
  expect(store.getState().collapsedProjectKeys.has("project")).toBe(true);
  act(() => {
    store.getState().toggleProjectCollapsed("project");
  });
  act(() => {
    useSidebarViewStore.setState({ groupMode: "status" });
  });
  const status = store
    .getState()
    .branches.find((branch) => branch.kind === "workspaceGroup" && branch.focused);
  expect(status).toBeDefined();
  expect(store.getState().collapsedWorkspaceGroupKeys.has(status!.key)).toBe(false);
  inputs.entries = new Map([[selected.entry.workspaceKey, selected.entry]]);
  view.rerender(
    <SidebarModelProvider>
      <span />
    </SidebarModelProvider>,
  );
  inputs.entries = new Map([
    [selected.entry.workspaceKey, { ...selected.entry, statusBucket: "done" }],
  ]);
  view.rerender(
    <SidebarModelProvider>
      <span />
    </SidebarModelProvider>,
  );
  expect(store.getState().collapsedWorkspaceGroupKeys.has(status!.key)).toBe(false);
  inputs.pinnedKeys = { pinnedWorkspaceKeys: [selected.entry.workspaceKey], pinnedAtByKey: {} };
  view.rerender(
    <SidebarModelProvider>
      <span />
    </SidebarModelProvider>,
  );
  expect(store.getState().collapsedPinned).toBe(false);
  inputs.selection = { serverId: "srv", workspaceId: "other" };
  view.rerender(
    <SidebarModelProvider>
      <span />
    </SidebarModelProvider>,
  );
  expect(store.getState().collapsedPinned).toBe(true);
});

it("releases a viewed idle branch after navigating away and back while hidden", () => {
  const store = useSidebarCollapsedSectionsStore;
  store.getState().synchronize([]);
  store.getState().resetSettings();
  useSidebarViewStore.setState({
    groupMode: "project",
    projectFilters: [],
    labelFilter: { labels: [] },
  });
  inputs.selection = { serverId: "srv", workspaceId: "selected" };
  inputs.tabId = "task-a";
  inputs.pinnedKeys = { pinnedWorkspaceKeys: [], pinnedAtByKey: {} };
  const selected = makeWorkspace("selected", "running");
  inputs.list = {
    projects: [makeProject([selected.placement])],
    workspacePlacements: [selected.placement],
    projectNamesByViewKey: new Map([["project", "Project"]]),
  };
  inputs.entries = new Map([[selected.entry.workspaceKey, selected.entry]]);
  const sidebar = (active: boolean) => (
    <SidebarModelProvider active={active}>
      <span />
    </SidebarModelProvider>
  );
  const view = render(sidebar(true));
  inputs.entries = new Map([
    [selected.entry.workspaceKey, { ...selected.entry, statusBucket: "done" }],
  ]);
  view.rerender(sidebar(true));
  expect(store.getState().collapsedProjectKeys.has("project")).toBe(false);
  view.rerender(sidebar(false));
  inputs.tabId = "task-b";
  view.rerender(sidebar(false));
  inputs.tabId = "task-a";
  view.rerender(sidebar(false));
  view.rerender(sidebar(true));
  expect(store.getState().collapsedProjectKeys.has("project")).toBe(true);

  inputs.entries = new Map([[selected.entry.workspaceKey, selected.entry]]);
  view.rerender(sidebar(true));
  expect(store.getState().collapsedProjectKeys.has("project")).toBe(false);
  // A retained inactive sidebar must not replace the visible sidebar's branch snapshot.
  inputs.list = { projects: [], workspacePlacements: [], projectNamesByViewKey: new Map() };
  const hidden = render(sidebar(false));
  expect(store.getState().branches.some((branch) => branch.key === "project")).toBe(true);
  expect(store.getState().collapsedProjectKeys.has("project")).toBe(false);
  hidden.unmount();
});
