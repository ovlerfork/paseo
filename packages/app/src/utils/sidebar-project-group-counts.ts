import type {
  SidebarProjectEntry,
  SidebarWorkspaceEntry,
} from "@/hooks/sidebar-workspaces-view-model";

export interface ProjectGroupCounts {
  attention: number;
  needsInput: number;
  running: number;
  projects: number;
}

export function countProjectGroupWorkspaces(
  projects: readonly Pick<SidebarProjectEntry, "workspaces">[],
  workspaceEntriesByKey: ReadonlyMap<string, Pick<SidebarWorkspaceEntry, "statusBucket">>,
): ProjectGroupCounts {
  const counts = { attention: 0, needsInput: 0, running: 0, projects: projects.length };
  for (const project of projects) {
    for (const workspace of project.workspaces) {
      const bucket = workspaceEntriesByKey.get(workspace.workspaceKey)?.statusBucket;
      if (bucket === "attention") counts.attention += 1;
      else if (bucket === "needs_input") counts.needsInput += 1;
      else if (bucket === "running") counts.running += 1;
    }
  }
  return counts;
}
