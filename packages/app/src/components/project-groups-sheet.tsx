import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import {
  AdaptiveModalSheet,
  AdaptiveTextInput,
  type SheetHeader,
} from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { PressHighlight } from "@/components/ui/press-highlight";
import { Field } from "@/components/ui/form-field";
import { SearchField } from "@/components/ui/search-field";
import { confirmDialog } from "@/utils/confirm-dialog";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import type { SidebarProjectEntry } from "@/hooks/use-sidebar-workspaces-list";

const ThemedCheck = withUnistyles(Check);
const accentForegroundCheckColor = (theme: Theme) => ({ color: theme.colors.accentForeground });

export interface ProjectGroupsSheetProps {
  visible: boolean;
  projects: readonly SidebarProjectEntry[];
  capableHosts: ReadonlyMap<string, boolean>;
  initialGroupName: string | null;
  onClose: () => void;
}

interface GroupWrite {
  serverId: string;
  projectId: string;
  projectName: string;
  groupName: string | null;
}

interface PendingGroupOperation {
  action: "save" | "delete";
  targets: GroupWrite[];
}

/** Edits one named group at a time; persistence stays with each owning host project. */
export function ProjectGroupsSheet({
  visible,
  projects,
  capableHosts,
  initialGroupName,
  onClose,
}: ProjectGroupsSheetProps) {
  const initialMembers = useMemo(
    () =>
      new Set(
        initialGroupName === null
          ? []
          : projects
              .filter((project) =>
                project.hosts.some((host) => host.groupName === initialGroupName),
              )
              .map((project) => project.viewKey),
      ),
    [initialGroupName, projects],
  );
  const [name, setName] = useState(initialGroupName ?? "");
  const [members, setMembers] = useState(initialMembers);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<PendingGroupOperation | null>(null);
  const draftLocked = saving || pending !== null;
  const [search, setSearch] = useState("");
  const [includeOtherGroups, setIncludeOtherGroups] = useState(false);
  const initializedEditorKey = useRef<string | null>(null);

  useEffect(() => {
    if (!visible) {
      initializedEditorKey.current = null;
      return;
    }
    const editorKey = initialGroupName ?? "new";
    if (initializedEditorKey.current === editorKey) return;
    initializedEditorKey.current = editorKey;
    setName(initialGroupName ?? "");
    setMembers(initialMembers);
    setError(null);
    setPending(null);
    setSearch("");
    setIncludeOtherGroups(false);
  }, [initialGroupName, initialMembers, visible]);

  const editable = useCallback(
    (project: SidebarProjectEntry) =>
      project.hosts.every(
        (host) =>
          (members.has(project.viewKey) && host.groupName !== initialGroupName) ||
          capableHosts.get(host.serverId) === true,
      ),
    [capableHosts, initialGroupName, members],
  );
  const selectedProjects = useMemo(
    () => projects.filter((project) => members.has(project.viewKey)),
    [members, projects],
  );
  const existingMembers = useMemo(
    () =>
      projects.filter(
        (project) =>
          initialGroupName !== null &&
          project.hosts.some((host) => host.groupName === initialGroupName),
      ),
    [initialGroupName, projects],
  );
  const visibleProjects = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return projects.filter((project) => {
      const belongsToCurrentGroup =
        initialGroupName !== null &&
        project.hosts.some((host) => host.groupName === initialGroupName);
      const isVisibleByGroup =
        includeOtherGroups ||
        project.groupName === null ||
        project.groupName === undefined ||
        belongsToCurrentGroup;
      if (!isVisibleByGroup) return false;
      return (
        normalizedSearch.length === 0 ||
        project.projectName.toLocaleLowerCase().includes(normalizedSearch) ||
        project.iconWorkingDir.toLocaleLowerCase().includes(normalizedSearch)
      );
    });
  }, [includeOtherGroups, initialGroupName, projects, search]);
  const toggleIncludeOtherGroups = useCallback(
    () => setIncludeOtherGroups((current) => !current),
    [],
  );
  const includeOtherGroupsAccessibilityState = useMemo(
    () => ({ checked: includeOtherGroups, disabled: draftLocked }),
    [draftLocked, includeOtherGroups],
  );
  const header = useMemo<SheetHeader>(
    () => ({ title: initialGroupName ? "Edit project group" : "New project group" }),
    [initialGroupName],
  );

  const toggleMember = useCallback((project: SidebarProjectEntry) => {
    setMembers((current) => {
      const next = new Set(current);
      if (next.has(project.viewKey)) next.delete(project.viewKey);
      else next.add(project.viewKey);
      return next;
    });
  }, []);

  const runOperation = useCallback(
    async (operation: PendingGroupOperation) => {
      setSaving(true);
      setError(null);
      const failures: GroupWrite[] = [];
      const messages: string[] = [];
      const runtime = getHostRuntimeStore();
      await Promise.all(
        operation.targets.map(async (target) => {
          try {
            if (capableHosts.get(target.serverId) !== true) {
              throw new Error("Update this host before changing project groups");
            }
            const client = runtime.getClient(target.serverId);
            if (!client) throw new Error("Host is disconnected");
            await client.setProjectGroup(target.projectId, target.groupName);
          } catch (cause) {
            failures.push(target);
            const serverLabel =
              runtime.getHosts().find((host) => host.serverId === target.serverId)?.label ??
              target.serverId;
            const detail = cause instanceof Error ? cause.message : String(cause);
            messages.push(`${target.projectName} (${serverLabel}): ${detail}`);
          }
        }),
      );
      setSaving(false);
      if (failures.length > 0) {
        setPending({ action: operation.action, targets: failures });
        setError(`${messages.join("; ")}. Retry to finish the change.`);
        return;
      }
      setPending(null);
      onClose();
    },
    [capableHosts, onClose],
  );

  const save = useCallback(async () => {
    if (saving || pending?.action === "delete") return;
    if (pending) {
      await runOperation(pending);
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Enter a group name.");
      return;
    }
    if (initialGroupName === null && selectedProjects.length === 0) {
      setError("Select at least one project.");
      return;
    }
    const targets: GroupWrite[] = selectedProjects.flatMap((project) =>
      project.hosts.map((host) => ({
        serverId: host.serverId,
        projectId: host.projectId,
        projectName: project.projectName,
        groupName: trimmedName,
      })),
    );
    for (const project of existingMembers) {
      if (members.has(project.viewKey)) continue;
      for (const host of project.hosts) {
        if (host.groupName !== initialGroupName) continue;
        targets.push({
          serverId: host.serverId,
          projectId: host.projectId,
          projectName: project.projectName,
          groupName: null,
        });
      }
    }
    await runOperation({ action: "save", targets });
  }, [
    existingMembers,
    initialGroupName,
    members,
    name,
    pending,
    runOperation,
    saving,
    selectedProjects,
  ]);

  const remove = useCallback(async () => {
    if (saving || pending?.action === "save") return;
    if (pending) {
      await runOperation(pending);
      return;
    }
    const confirmed = await confirmDialog({
      title: "Delete project group?",
      message: `Projects will remain available outside ${initialGroupName}.`,
      confirmLabel: "Delete group",
      cancelLabel: "Cancel",
      destructive: true,
    });
    if (!confirmed) return;
    const targets: GroupWrite[] = existingMembers.flatMap((project) =>
      project.hosts
        .filter((host) => host.groupName === initialGroupName)
        .map((host) => ({
          serverId: host.serverId,
          projectId: host.projectId,
          projectName: project.projectName,
          groupName: null,
        })),
    );
    await runOperation({ action: "delete", targets });
  }, [existingMembers, initialGroupName, pending, runOperation, saving]);

  const handleRemove = useCallback(() => {
    void remove();
  }, [remove]);
  const handleSave = useCallback(() => {
    void save();
  }, [save]);
  const handleClose = useCallback(() => {
    if (!saving) onClose();
  }, [onClose, saving]);
  const footer = useMemo(
    () => (
      <View style={styles.footer}>
        {initialGroupName ? (
          <Button
            variant="outline"
            size="md"
            onPress={handleRemove}
            disabled={saving || pending?.action === "save"}
          >
            Delete
          </Button>
        ) : null}
        <View style={styles.footerSpacer} />
        <Button variant="secondary" size="md" onPress={handleClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="default"
          size="md"
          onPress={handleSave}
          loading={saving}
          disabled={saving || pending?.action === "delete"}
        >
          Save
        </Button>
      </View>
    ),
    [handleClose, handleRemove, handleSave, initialGroupName, pending, saving],
  );

  return (
    <AdaptiveModalSheet
      visible={visible}
      onClose={handleClose}
      header={header}
      footer={footer}
      desktopMaxWidth={440}
      testID="project-groups-sheet"
    >
      <Field label="Group name" error={error}>
        <AdaptiveTextInput
          testID="project-group-name"
          initialValue={name}
          onChangeText={setName}
          editable={!draftLocked}
          placeholder="Projects"
        />
      </Field>
      <Text style={styles.label}>Projects</Text>
      <View style={styles.projectFilters}>
        <SearchField
          key={`${initialGroupName ?? "new"}-${visible ? "open" : "closed"}`}
          value={search}
          onChangeText={setSearch}
          placeholder="Search projects"
          clearAccessibilityLabel="Clear project search"
          testID="project-group-search"
          clearTestID="project-group-search-clear"
        />
        <PressHighlight
          accessibilityRole="checkbox"
          accessibilityLabel="Include projects in other groups"
          accessibilityState={includeOtherGroupsAccessibilityState}
          disabled={draftLocked}
          onPress={toggleIncludeOtherGroups}
          style={styles.includeOtherGroups}
          testID="project-group-include-other-groups"
        >
          <View style={[styles.checkbox, includeOtherGroups && styles.checkboxSelected]}>
            {includeOtherGroups ? (
              <ThemedCheck size={14} uniProps={accentForegroundCheckColor} />
            ) : null}
          </View>
          <Text style={styles.includeOtherGroupsLabel}>Include projects in other groups</Text>
        </PressHighlight>
      </View>
      <ScrollView style={styles.projects} contentContainerStyle={styles.projectsContent}>
        {visibleProjects.length > 0 ? (
          visibleProjects.map((project) => (
            <ProjectGroupMemberRow
              key={project.viewKey}
              project={project}
              enabled={editable(project)}
              selected={members.has(project.viewKey)}
              saving={draftLocked}
              onToggle={toggleMember}
            />
          ))
        ) : (
          <Text style={styles.emptyProjects}>
            {search.trim() ? "No projects match your search" : "No projects available"}
          </Text>
        )}
      </ScrollView>
    </AdaptiveModalSheet>
  );
}

function ProjectGroupMemberRow({
  project,
  enabled,
  selected,
  saving,
  onToggle,
}: {
  project: SidebarProjectEntry;
  enabled: boolean;
  selected: boolean;
  saving: boolean;
  onToggle: (project: SidebarProjectEntry) => void;
}) {
  const handlePress = useCallback(() => onToggle(project), [onToggle, project]);
  const accessibilityState = useMemo(
    () => ({ checked: selected, disabled: !enabled || saving }),
    [enabled, saving, selected],
  );
  return (
    <PressHighlight
      testID={`project-group-project-${project.viewKey}`}
      accessibilityRole="checkbox"
      accessibilityState={accessibilityState}
      disabled={!enabled || saving}
      onPress={handlePress}
      style={styles.projectRow}
    >
      <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
        {selected ? <Text style={styles.checkmark}>✓</Text> : null}
      </View>
      <Text style={[styles.projectName, !enabled && styles.projectNameDisabled]} numberOfLines={1}>
        {project.projectName}
      </Text>
    </PressHighlight>
  );
}

const styles = StyleSheet.create((theme) => ({
  footer: { flexDirection: "row", gap: theme.spacing[2], alignItems: "center" },
  footerSpacer: { flex: 1 },
  label: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: "500",
    marginTop: theme.spacing[3],
    marginBottom: theme.spacing[2],
  },
  projectFilters: { gap: theme.spacing[2], marginBottom: theme.spacing[2] },
  includeOtherGroups: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
  },
  includeOtherGroupsLabel: { color: theme.colors.foreground, fontSize: theme.fontSize.sm },
  projects: { maxHeight: 300 },
  projectsContent: { gap: theme.spacing[1] },
  emptyProjects: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[3],
  },
  projectRow: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    borderRadius: 6,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  checkmark: { color: theme.colors.accentForeground, fontWeight: "700" },
  projectName: { color: theme.colors.foreground, fontSize: theme.fontSize.base, flex: 1 },
  projectNameDisabled: { color: theme.colors.foregroundMuted },
}));
