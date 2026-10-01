import { describe, expect, it } from "vitest";
import type { SidebarWorkspacePlacement } from "@/hooks/sidebar-workspaces-view-model";
import { countProjectGroupWorkspaces } from "./sidebar-project-group-counts";

function workspace(workspaceKey: string): SidebarWorkspacePlacement {
  return {
    workspaceKey,
    serverId: "host",
    workspaceId: workspaceKey,
    projectViewKey: "project",
    projectName: "Project",
    projectKind: "git",
    workspaceKind: "worktree",
    name: workspaceKey,
  };
}

describe("countProjectGroupWorkspaces", () => {
  it("counts workspace states across repositories independently of repository total", () => {
    const projects = [
      { workspaces: [workspace("review"), workspace("input"), workspace("working")] },
      { workspaces: [workspace("working-two"), workspace("read"), workspace("failed")] },
      { workspaces: [workspace("not-loaded")] },
      { workspaces: [] },
    ];
    const entries = new Map([
      ["review", { statusBucket: "attention" as const }],
      ["input", { statusBucket: "needs_input" as const }],
      ["working", { statusBucket: "running" as const }],
      ["working-two", { statusBucket: "running" as const }],
      ["read", { statusBucket: "done" as const }],
      ["failed", { statusBucket: "failed" as const }],
    ]);
    expect(countProjectGroupWorkspaces(projects, entries)).toEqual({
      attention: 1,
      needsInput: 1,
      running: 2,
      projects: 4,
    });
    entries.set("working", { statusBucket: "attention" });
    expect(countProjectGroupWorkspaces(projects, entries)).toEqual({
      attention: 2,
      needsInput: 1,
      running: 1,
      projects: 4,
    });
  });
});
