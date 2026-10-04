/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Text } from "react-native";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { SidebarExpansionMenuContent } from "./sidebar-expansion-menu";
import { useSidebarCollapsedSectionsStore } from "@/stores/sidebar-collapsed-sections-store";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn(),
  },
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

beforeEach(() => {
  vi.stubGlobal("React", React);
  useSidebarCollapsedSectionsStore
    .getState()
    .synchronize([{ kind: "project", key: "project", activity: 0 }]);
  useSidebarCollapsedSectionsStore.getState().resetSettings();
});
afterEach(cleanup);

it("opens expansion settings with right click, applies choices without closing, and preserves left click", () => {
  const onCreate = vi.fn();
  render(
    <ContextMenu>
      <ContextMenuTrigger onPress={onCreate} testID="new-group">
        <Text>New project group</Text>
      </ContextMenuTrigger>
      <SidebarExpansionMenuContent />
    </ContextMenu>,
  );
  fireEvent.click(screen.getByTestId("new-group"));
  expect(onCreate).toHaveBeenCalledTimes(1);
  fireEvent.contextMenu(screen.getByTestId("new-group"), { clientX: 100, clientY: 100 });
  fireEvent.click(screen.getByTestId("sidebar-expansion-idle-expanded"));
  expect(useSidebarCollapsedSectionsStore.getState().collapsedProjectKeys.size).toBe(0);
  fireEvent.click(screen.getByTestId("sidebar-expansion-running"));
  expect(useSidebarCollapsedSectionsStore.getState().settings.running).toBe(false);
  fireEvent.click(screen.getByTestId("sidebar-expansion-reset"));
  expect(useSidebarCollapsedSectionsStore.getState().settings.running).toBe(true);
  expect(useSidebarCollapsedSectionsStore.getState().collapsedProjectKeys.has("project")).toBe(
    true,
  );
  expect(onCreate).toHaveBeenCalledTimes(1);
});
