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
  onClose: () => void;
}

interface AdaptiveTextInputMockProps {
  initialValue: string;
  testID?: string;
  editable?: boolean;
  onChangeText?: (value: string) => void;
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

function AdaptiveModalSheetMock({
  visible,
  children,
  footer,
  onClose,
}: AdaptiveModalSheetMockProps) {
  return visible ? (
    <div>
      {children}
      {footer}
      <button type="button" data-testid="project-group-dismiss" onClick={onClose}>
        Dismiss
      </button>
    </div>
  ) : null;
}

function AdaptiveTextInputMock({
  initialValue,
  testID,
  editable,
  onChangeText,
}: AdaptiveTextInputMockProps) {
  const handleChange = React.useCallback(
    (event: React.FormEvent<HTMLInputElement>) => onChangeText?.(event.currentTarget.value),
    [onChangeText],
  );
  return (
    <input
      data-testid={testID}
      defaultValue={initialValue}
      disabled={editable === false}
      onInput={handleChange}
    />
  );
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

function SearchFieldMock({
  value,
  onChangeText,
  testID,
}: {
  value: string;
  onChangeText: (value: string) => void;
  testID?: string;
}) {
  const handleSearchClients = React.useCallback(() => onChangeText("clients"), [onChangeText]);

  return (
    <>
      <input data-testid={testID} value={value} readOnly />
      <button type="button" data-testid={`${testID}-search-clients`} onClick={handleSearchClients}>
        Search clients
      </button>
    </>
  );
}

vi.mock("lucide-react-native", () => ({ Check: () => null }));
vi.mock("react-native", () => ({
  View: "div",
  Text: "span",
  ScrollView: "div",
  Pressable: PressableMock,
}));
vi.mock("react-native-unistyles", () => ({
  withUnistyles: <T,>(component: T) => component,
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
vi.mock("@/components/ui/press-highlight", () => ({ PressHighlight: PressableMock }));
vi.mock("@/components/ui/form-field", () => ({ Field: FieldMock }));
vi.mock("@/components/ui/search-field", () => ({ SearchField: SearchFieldMock }));
vi.mock("@/utils/confirm-dialog", () => ({ confirmDialog: vi.fn() }));
const { setProjectGroup, hostClients } = vi.hoisted(() => ({
  setProjectGroup: vi.fn(),
  hostClients: new Map<
    string,
    { setProjectGroup: (projectId: string, groupName: string | null) => Promise<void> } | null
  >(),
}));

vi.mock("@/runtime/host-runtime", () => ({
  getHostRuntimeStore: () => ({
    getClient: (serverId: string) => hostClients.get(serverId) ?? null,
    getHosts: () => [
      { serverId: "host", label: "Local" },
      { serverId: "remote", label: "Remote" },
    ],
  }),
}));

import { confirmDialog } from "@/utils/confirm-dialog";
import { ProjectGroupsSheet } from "./project-groups-sheet";

beforeEach(() => {
  setProjectGroup.mockReset();
  hostClients.clear();
  hostClients.set("host", { setProjectGroup });
  vi.mocked(confirmDialog).mockReset();
  vi.mocked(confirmDialog).mockResolvedValue(true);
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
      groupName: null as string | null,
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
  const groupedProject = {
    ...project,
    groupName: "Clients",
    hosts: [{ ...project.hosts[0], groupName: "Clients" }],
  };
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

it("keeps selected projects when the editor filters them from view", async () => {
  const currentGroupProject = {
    ...project,
    groupName: "Clients",
    hosts: [{ ...project.hosts[0], groupName: "Clients" }],
  };
  const otherGroupProject = {
    ...project,
    viewKey: "two",
    projectName: "Other client",
    groupName: "Other",
    hosts: [{ ...project.hosts[0], projectId: "project-two", groupName: "Other" }],
  };
  const view = render(
    <ProjectGroupsSheet
      visible
      projects={[currentGroupProject, otherGroupProject]}
      capableHosts={new Map([["host", true]])}
      initialGroupName="Clients"
      onClose={vi.fn()}
    />,
  );

  expect(view.queryByTestId("project-group-project-two")).toBeNull();
  fireEvent.click(view.getByTestId("project-group-include-other-groups"));
  fireEvent.click(view.getByTestId("project-group-project-two"));
  fireEvent.click(view.getByTestId("project-group-search-search-clients"));
  expect(view.queryByTestId("project-group-project-two")).toBeNull();

  fireEvent.click(view.getByText("Save"));
  await waitFor(() => expect(setProjectGroup).toHaveBeenCalledWith("project-two", "Clients"));
});

function connectHost(serverId: string, groups: Map<string, string | null>) {
  const client = {
    setProjectGroup: vi.fn(async (projectId: string, groupName: string | null) => {
      if (!groups.has(projectId)) throw new Error(`Unknown project: ${projectId}`);
      groups.set(projectId, groupName);
    }),
  };
  hostClients.set(serverId, client);
  return client;
}

const multiHostProject = {
  ...project,
  hosts: [
    { ...project.hosts[0], groupName: "Clients" },
    {
      ...project.hosts[0],
      serverId: "remote",
      projectId: "remote-project",
      groupName: "Clients",
    },
  ],
};

it("creates a group only for selected host placements and leaves unchecked hosts unchanged", async () => {
  const localGroups = new Map<string, string | null>([["project", null]]);
  const remoteGroups = new Map<string, string | null>([["remote-project", null]]);
  connectHost("host", localGroups);
  connectHost("remote", remoteGroups);
  const onClose = vi.fn();
  const view = render(
    <ProjectGroupsSheet
      visible
      projects={[
        project,
        {
          ...project,
          viewKey: "unchecked",
          projectName: "Unchecked",
          hosts: [{ ...project.hosts[0], serverId: "remote", projectId: "remote-project" }],
        },
      ]}
      capableHosts={new Map([["host", true]])}
      initialGroupName={null}
      onClose={onClose}
    />,
  );
  fireEvent.input(view.getByTestId("project-group-name"), { target: { value: "New group" } });
  fireEvent.click(view.getByTestId("project-group-project-one"));
  fireEvent.click(view.getByText("Save"));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  expect(localGroups.get("project")).toBe("New group");
  expect(remoteGroups.get("remote-project")).toBeNull();
});

it("retains a partial rename and retries the failed project on the reconnected host", async () => {
  const localGroups = new Map<string, string | null>([["project", "Clients"]]);
  const remoteGroups = new Map<string, string | null>([["remote-project", "Clients"]]);
  const localClient = connectHost("host", localGroups);
  hostClients.set("remote", {
    setProjectGroup: async () => {
      throw new Error("Connection closed");
    },
  });
  const onClose = vi.fn();
  const props = {
    visible: true,
    capableHosts: new Map([
      ["host", true],
      ["remote", true],
    ]),
    initialGroupName: "Clients",
    onClose,
  };
  const view = render(<ProjectGroupsSheet {...props} projects={[multiHostProject]} />);
  expect(view.getByTestId("project-group-project-one").textContent).toContain("✓");
  fireEvent.input(view.getByTestId("project-group-name"), { target: { value: "Renamed" } });
  fireEvent.click(view.getByText("Save"));
  await view.findByText("One (Remote): Connection closed. Retry to finish the change.");
  expect(localGroups.get("project")).toBe("Renamed");
  expect(remoteGroups.get("remote-project")).toBe("Clients");
  expect(onClose).not.toHaveBeenCalled();
  expect(view.getByDisplayValue("Renamed").getAttribute("disabled")).toBe("");
  expect(view.getByText("Delete").getAttribute("disabled")).toBe("");
  expect(view.getByText("Cancel").getAttribute("disabled")).toBeNull();
  expect(view.getByTestId("project-group-project-one").getAttribute("disabled")).toBe("");

  connectHost("remote", remoteGroups);
  // A successful host can disappear from the refreshed project list while the failed target remains.
  view.rerender(
    <ProjectGroupsSheet
      {...props}
      projects={[
        { ...multiHostProject, hosts: [{ ...multiHostProject.hosts[1], groupName: "Clients" }] },
      ]}
    />,
  );
  fireEvent.click(view.getByText("Save"));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  expect(localGroups.get("project")).toBe("Renamed");
  expect(remoteGroups.get("remote-project")).toBe("Renamed");
  expect(localClient.setProjectGroup).toHaveBeenCalledOnce();
});

it.each(["Save", "Delete"])(
  "retries a partial %s clearing only placements in the edited group",
  async (action) => {
    const localGroups = new Map<string, string | null>([["project", "Clients"]]);
    const remoteGroups = new Map<string, string | null>([
      ["remote-project", "Clients"],
      ["other-project", "Other"],
    ]);
    const localClient = connectHost("host", localGroups);
    hostClients.set("remote", null);
    const mixedProject = {
      ...multiHostProject,
      hosts: [
        ...multiHostProject.hosts,
        {
          ...multiHostProject.hosts[1],
          serverId: "other",
          projectId: "other-project",
          groupName: "Other",
        },
      ],
    };
    const onClose = vi.fn();
    const props = {
      visible: true,
      capableHosts: new Map([
        ["host", true],
        ["remote", true],
      ]),
      initialGroupName: "Clients",
      onClose,
    };
    const view = render(<ProjectGroupsSheet {...props} projects={[mixedProject]} />);
    expect(view.getByTestId("project-group-project-one").textContent).toContain("✓");
    if (action === "Save") fireEvent.click(view.getByTestId("project-group-project-one"));
    fireEvent.click(view.getByText(action));
    await view.findByText("One (Remote): Host is disconnected. Retry to finish the change.");
    expect(localGroups.get("project")).toBeNull();
    expect(remoteGroups.get("remote-project")).toBe("Clients");
    expect(remoteGroups.get("other-project")).toBe("Other");
    expect(onClose).not.toHaveBeenCalled();
    expect(view.getByTestId("project-group-project-one").textContent?.includes("✓")).toBe(
      action === "Delete",
    );
    expect(view.getByDisplayValue("Clients").getAttribute("disabled")).toBe("");
    expect(view.getByText(action === "Save" ? "Delete" : "Save").getAttribute("disabled")).toBe("");
    expect(view.getByText("Cancel").getAttribute("disabled")).toBeNull();

    connectHost("remote", remoteGroups);
    view.rerender(
      <ProjectGroupsSheet
        {...props}
        projects={[
          {
            ...mixedProject,
            hosts: [{ ...mixedProject.hosts[0], groupName: null }, ...mixedProject.hosts.slice(1)],
          },
        ]}
      />,
    );
    fireEvent.click(view.getByText(action));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(localGroups.get("project")).toBeNull();
    expect(remoteGroups.get("remote-project")).toBeNull();
    expect(remoteGroups.get("other-project")).toBe("Other");
    expect(localClient.setProjectGroup).toHaveBeenCalledOnce();
  },
);

it("blocks closing during an active write and allows Cancel after the write fails", async () => {
  let rejectWrite!: (reason: Error) => void;
  const write = new Promise<void>((_resolve, reject) => {
    rejectWrite = reject;
  });
  setProjectGroup.mockReturnValue(write);
  const onClose = vi.fn();
  const view = render(
    <ProjectGroupsSheet
      visible
      projects={[multiHostProject]}
      capableHosts={
        new Map([
          ["host", true],
          ["remote", true],
        ])
      }
      initialGroupName="Clients"
      onClose={onClose}
    />,
  );
  fireEvent.click(view.getByText("Save"));
  expect(view.getByText("Cancel").getAttribute("disabled")).toBe("");
  fireEvent.click(view.getByText("Cancel"));
  fireEvent.click(view.getByTestId("project-group-dismiss"));
  expect(onClose).not.toHaveBeenCalled();

  rejectWrite(new Error("Connection closed"));
  await view.findByText(/One \(Local\): Connection closed.*Retry to finish the change\./);
  expect(view.getByText("Cancel").getAttribute("disabled")).toBeNull();
  fireEvent.click(view.getByText("Cancel"));
  expect(onClose).toHaveBeenCalledOnce();
});
