import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { useSidebarCollapsedSectionsStore } from "@/stores/sidebar-collapsed-sections-store";

export function SidebarExpansionMenuContent() {
  const { t } = useTranslation();
  const resetSettings = useSidebarCollapsedSectionsStore((state) => state.resetSettings);
  return (
    <ContextMenuContent width={280} testID="sidebar-expansion-menu">
      <ContextMenuLabel>{t("sidebar.expansion.title")}</ContextMenuLabel>
      <ContextMenuLabel>{t("sidebar.expansion.idle")}</ContextMenuLabel>
      {(["collapsed", "expanded"] as const).map((idle) => (
        <ExpansionOption key={idle} option={idle} />
      ))}
      <ContextMenuSeparator />
      <ContextMenuLabel>{t("sidebar.expansion.automatic")}</ContextMenuLabel>
      {(["running", "needsInput", "attention"] as const).map((trigger) => (
        <ExpansionOption key={trigger} option={trigger} />
      ))}
      <ContextMenuSeparator />
      <ContextMenuItem
        onSelect={resetSettings}
        closeOnSelect={false}
        testID="sidebar-expansion-reset"
      >
        {t("sidebar.expansion.reset")}
      </ContextMenuItem>
    </ContextMenuContent>
  );
}

function ExpansionOption({
  option,
}: {
  option: "collapsed" | "expanded" | "running" | "needsInput" | "attention";
}) {
  const { t } = useTranslation();
  const settings = useSidebarCollapsedSectionsStore((state) => state.settings);
  const setSettings = useSidebarCollapsedSectionsStore((state) => state.setSettings);
  const isIdle = option === "collapsed" || option === "expanded";
  const selected = isIdle ? settings.idle === option : settings[option];
  const onSelect = useCallback(() => {
    if (option === "collapsed" || option === "expanded") setSettings({ ...settings, idle: option });
    else setSettings({ ...settings, [option]: !settings[option] });
  }, [option, settings, setSettings]);
  return (
    <ContextMenuItem
      selected={selected}
      showSelectedCheck
      closeOnSelect={false}
      onSelect={onSelect}
      testID={`sidebar-expansion-${isIdle ? "idle-" : ""}${option}`}
    >
      {t(`sidebar.expansion.${option}`)}
    </ContextMenuItem>
  );
}
