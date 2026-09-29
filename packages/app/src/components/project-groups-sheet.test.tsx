import { JSDOM } from "jsdom";
import React from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface ButtonMockProps {
  children?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
}

interface AdaptiveModalSheetMockProps {
  visible: boolean;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}

interface AdaptiveTextInputMockProps {
  initialValue: string;
  testID?: string;
}

interface FieldMockProps {
  children?: React.ReactNode;
  error?: string | null;
}

function PressableMock({ children, onPress, disabled, testID }: ButtonMockProps) {
  return (
    <button type="button" data-testid={testID} disabled={disabled} onClick={onPress}>
      {children}
    </button>
  );
}

function AdaptiveModalSheetMock({ visible, children, footer }: AdaptiveModalSheetMockProps) {
  return visible ? (
    <div>
      {children}
      {footer}
    </div>
  ) : null;
}

function AdaptiveTextInputMock({ initialValue, testID }: AdaptiveTextInputMockProps) {
  return <input data-testid={testID} defaultValue={initialValue} />;
}

function ButtonMock({ children, onPress, disabled }: ButtonMockProps) {
  return (
    <button type="button" disabled={disabled} onClick={onPress}>
      {children}
    </button>
  );
}

function FieldMock({ children, error }: FieldMockProps) {
  return (
    <div>
      {children}
      {error ? <span>{error}</span> : null}
    </div>
  );
}

vi.mock("react-native", () => ({
  View: "div",
  Text: "span",
  ScrollView: "div",
  Pressable: PressableMock,
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: (theme: object) => object) =>
      factory({
        spacing: { 1: 4, 2: 8, 3: 12 },
        colors: {
          foreground: "#000",
          foregroundMuted: "#666",
          border: "#ccc",
          accent: "#06f",
          accentForeground: "#fff",
        },
        fontSize: { sm: 12, base: 14 },
      }),
  },
}));
vi.mock("@/components/adaptive-modal-sheet", () => ({
  AdaptiveModalSheet: AdaptiveModalSheetMock,
  AdaptiveTextInput: AdaptiveTextInputMock,
}));
vi.mock("@/components/ui/button", () => ({ Button: ButtonMock }));
vi.mock("@/components/ui/form-field", () => ({ Field: FieldMock }));
vi.mock("@/utils/confirm-dialog", () => ({ confirmDialog: vi.fn() }));
const { setProjectGroup } = vi.hoisted(() => ({ setProjectGroup: vi.fn() }));

vi.mock("@/runtime/host-runtime", () => ({
  getHostRuntimeStore: () => ({ getClient: () => ({ setProjectGroup }) }),
}));

import { ProjectGroupsSheet } from "./project-groups-sheet";

beforeEach(() => {
  setProjectGroup.mockReset();
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
  vi.stubGlobal("Node", dom.window.Node);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const project = {
  viewKey: "one",
  projectName: "One",
  groupName: null,
  hosts: [
    {
      serverId: "host",
      projectId: "project",
      iconWorkingDir: "/repo",
      worktreeSupport: "supported" as const,
    },
  ],
  workspaces: [],
  projectKind: "git" as const,
  iconWorkingDir: "/repo",
};

describe("ProjectGroupsSheet", () => {
  it("starts a new group without selecting existing ungrouped projects", () => {
    const view = render(
      <ProjectGroupsSheet
        visible
        projects={[project]}
        capableHosts={new Map([["host", true]])}
        initialGroupName={null}
        onClose={vi.fn()}
      />,
    );
    expect(view.getByTestId("project-group-project-one").textContent).not.toContain("✓");
  });
});

it("keeps an in-progress selection when project descriptors update", () => {
  const props = {
    visible: true,
    capableHosts: new Map([["host", true]]),
    initialGroupName: null,
    onClose: vi.fn(),
  };
  const view = render(<ProjectGroupsSheet {...props} projects={[project]} />);
  const member = view.getByTestId("project-group-project-one");
  fireEvent.click(member);
  expect(member.textContent).toContain("✓");

  view.rerender(
    <ProjectGroupsSheet {...props} projects={[{ ...project, projectName: "One updated" }]} />,
  );

  expect(view.getByTestId("project-group-project-one").textContent).toContain("✓");
});

it("clears the final membership when saving an existing group", async () => {
  const onClose = vi.fn();
  const groupedProject = { ...project, groupName: "Clients" };
  const view = render(
    <ProjectGroupsSheet
      visible
      projects={[groupedProject]}
      capableHosts={new Map([["host", true]])}
      initialGroupName="Clients"
      onClose={onClose}
    />,
  );

  fireEvent.click(view.getByTestId("project-group-project-one"));
  fireEvent.click(view.getByText("Save"));

  await waitFor(() => expect(setProjectGroup).toHaveBeenCalledWith("project", null));
  expect(onClose).toHaveBeenCalledOnce();
});
