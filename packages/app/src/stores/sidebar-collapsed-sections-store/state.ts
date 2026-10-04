import { z } from "zod";

export const SidebarExpansionSettingsSchema = z.strictObject({
  idle: z.enum(["collapsed", "expanded"]),
  running: z.boolean(),
  needsInput: z.boolean(),
  attention: z.boolean(),
});
export type SidebarExpansionSettings = z.infer<typeof SidebarExpansionSettingsSchema>;
export const DEFAULT_SIDEBAR_EXPANSION_SETTINGS: SidebarExpansionSettings = {
  idle: "collapsed",
  running: true,
  needsInput: false,
  attention: false,
};

export interface SidebarExpansionBranch {
  kind: "project" | "projectGroup" | "workspaceGroup" | "pinned";
  key: string;
  activity: number;
}

export function sidebarActivity(buckets: Iterable<string | undefined>): number {
  let activity = 0;
  for (const bucket of buckets) {
    if (bucket === "running") activity |= 1;
    if (bucket === "needs_input") activity |= 2;
    if (bucket === "attention") activity |= 4;
  }
  return activity;
}

export function sidebarBranchId(branch: Pick<SidebarExpansionBranch, "kind" | "key">): string {
  return JSON.stringify([branch.kind, branch.key]);
}

export interface SidebarExpansionBranchState {
  activity: number;
  collapsed: boolean;
  manual: boolean;
}

export function reconcileSidebarExpansion(
  previous: ReadonlyMap<string, SidebarExpansionBranchState>,
  branches: readonly SidebarExpansionBranch[],
  settings: SidebarExpansionSettings,
): Map<string, SidebarExpansionBranchState> {
  const next = new Map<string, SidebarExpansionBranchState>();
  for (const branch of branches) {
    const id = sidebarBranchId(branch);
    const current = previous.get(id);
    const enabledActivity =
      (settings.running ? 1 : 0) | (settings.needsInput ? 2 : 0) | (settings.attention ? 4 : 0);
    next.set(
      id,
      current?.activity === branch.activity && current.manual
        ? current
        : {
            activity: branch.activity,
            collapsed: settings.idle === "collapsed" && !(branch.activity & enabledActivity),
            manual: false,
          },
    );
  }
  return next;
}
