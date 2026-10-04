import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { z } from "zod";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";
import {
  DEFAULT_SIDEBAR_EXPANSION_SETTINGS,
  SidebarExpansionSettingsSchema,
  reconcileSidebarExpansion,
  sidebarBranchId,
  type SidebarExpansionBranch,
  type SidebarExpansionBranchState,
  type SidebarExpansionSettings,
} from "./state";

interface SidebarCollapsedSectionsState {
  settings: SidebarExpansionSettings;
  branches: SidebarExpansionBranch[];
  branchStates: Map<string, SidebarExpansionBranchState>;
  collapsedProjectKeys: Set<string>;
  collapsedProjectGroupNames: Set<string>;
  collapsedWorkspaceGroupKeys: Set<string>;
  collapsedPinned: boolean;
  synchronize: (branches: SidebarExpansionBranch[]) => void;
  setSettings: (settings: SidebarExpansionSettings) => void;
  resetSettings: () => void;
  toggleProjectCollapsed: (projectKey: string) => void;
  setProjectCollapsed: (projectKey: string, collapsed: boolean) => void;
  toggleProjectGroupCollapsed: (groupName: string) => void;
  toggleWorkspaceGroupCollapsed: (workspaceGroupKey: string) => void;
  togglePinnedCollapsed: () => void;
}

function collapseState(
  branches: SidebarExpansionBranch[],
  branchStates: Map<string, SidebarExpansionBranchState>,
) {
  const collapsedProjectKeys = new Set<string>();
  const collapsedProjectGroupNames = new Set<string>();
  const collapsedWorkspaceGroupKeys = new Set<string>();
  let collapsedPinned = true;
  for (const branch of branches) {
    if (!branchStates.get(sidebarBranchId(branch))?.collapsed) {
      if (branch.kind === "pinned") collapsedPinned = false;
      continue;
    }
    switch (branch.kind) {
      case "project":
        collapsedProjectKeys.add(branch.key);
        break;
      case "projectGroup":
        collapsedProjectGroupNames.add(branch.key);
        break;
      case "workspaceGroup":
        collapsedWorkspaceGroupKeys.add(branch.key);
        break;
      case "pinned":
        collapsedPinned = true;
        break;
    }
  }
  return {
    branches,
    branchStates,
    collapsedProjectKeys,
    collapsedProjectGroupNames,
    collapsedWorkspaceGroupKeys,
    collapsedPinned,
  };
}

export const useSidebarCollapsedSectionsStore = create<SidebarCollapsedSectionsState>()(
  persist(
    (set) => {
      const setManual = (kind: SidebarExpansionBranch["kind"], key: string, collapsed?: boolean) =>
        set((state) => {
          const id = sidebarBranchId({ kind, key });
          const current = state.branchStates.get(id);
          if (!current) return state;
          const next = new Map(state.branchStates);
          next.set(id, { ...current, collapsed: collapsed ?? !current.collapsed, manual: true });
          return collapseState(state.branches, next);
        });
      const setSettings = (settings: SidebarExpansionSettings) =>
        set((state) => ({
          settings,
          ...collapseState(
            state.branches,
            reconcileSidebarExpansion(new Map(), state.branches, settings),
          ),
        }));
      return {
        settings: DEFAULT_SIDEBAR_EXPANSION_SETTINGS,
        ...collapseState([], new Map()),
        synchronize: (branches) =>
          set((state) => {
            const next = reconcileSidebarExpansion(state.branchStates, branches, state.settings);
            if (
              next.size === state.branchStates.size &&
              [...next].every(([id, value]) => {
                const current = state.branchStates.get(id);
                return (
                  current?.activity === value.activity &&
                  current.collapsed === value.collapsed &&
                  current.manual === value.manual
                );
              })
            )
              return state;
            return collapseState(branches, next);
          }),
        setSettings,
        resetSettings: () => setSettings(DEFAULT_SIDEBAR_EXPANSION_SETTINGS),
        toggleProjectCollapsed: (key) => setManual("project", key),
        setProjectCollapsed: (key, collapsed) => setManual("project", key, collapsed),
        toggleProjectGroupCollapsed: (key) => setManual("projectGroup", key),
        toggleWorkspaceGroupCollapsed: (key) => setManual("workspaceGroup", key),
        togglePinnedCollapsed: () => setManual("pinned", "pinned"),
      };
    },
    {
      name: "sidebar-expansion-settings",
      storage: createValidatedPersistStorage(
        AsyncStorage,
        z.strictObject({ settings: SidebarExpansionSettingsSchema }),
      ),
      partialize: (state) => ({ settings: state.settings }),
      merge: (persisted, current) => {
        const result = z
          .strictObject({ settings: SidebarExpansionSettingsSchema })
          .safeParse(persisted);
        if (!result.success) return current;
        return {
          ...current,
          settings: result.data.settings,
          ...collapseState(
            current.branches,
            reconcileSidebarExpansion(new Map(), current.branches, result.data.settings),
          ),
        };
      },
    },
  ),
);
