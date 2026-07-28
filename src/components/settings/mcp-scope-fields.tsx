"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";

import { Checkbox } from "@/components/ui/checkbox";
import {
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import type { McpScope } from "@/lib/mcp/scopes";

// Scope picker shared by the "new token" and "edit permissions" dialogs.
// Grouped by domain so the read/write pair reads as one decision; a token
// with nothing checked stays a plain webhook-ingest token.
const SCOPE_GROUPS: ReadonlyArray<{
  key: string;
  labelKey: string;
  scopes: ReadonlyArray<{ scope: McpScope; accessKey: string }>;
}> = [
  {
    key: "mail",
    labelKey: "scopeGroupMail",
    scopes: [
      { scope: "mail:read", accessKey: "scopeAccessRead" },
      { scope: "mail:write", accessKey: "scopeAccessSend" },
    ],
  },
  {
    key: "alerts",
    labelKey: "scopeGroupAlerts",
    scopes: [{ scope: "alerts:read", accessKey: "scopeAccessRead" }],
  },
  {
    key: "bookmarks",
    labelKey: "scopeGroupBookmarks",
    scopes: [
      { scope: "bookmarks:read", accessKey: "scopeAccessRead" },
      { scope: "bookmarks:write", accessKey: "scopeAccessCreate" },
    ],
  },
  {
    key: "servers",
    labelKey: "scopeGroupServers",
    scopes: [{ scope: "servers:read", accessKey: "scopeAccessRead" }],
  },
  {
    key: "services",
    labelKey: "scopeGroupServices",
    scopes: [{ scope: "services:read", accessKey: "scopeAccessRead" }],
  },
  {
    key: "logs",
    labelKey: "scopeGroupLogs",
    scopes: [{ scope: "logs:read", accessKey: "scopeAccessRead" }],
  },
];

interface McpScopeFieldsProps {
  value: McpScope[];
  onChange: (scopes: McpScope[]) => void;
}

export function McpScopeFields({ value, onChange }: McpScopeFieldsProps) {
  const t = useTranslations("settings");
  const idPrefix = useId();

  function toggle(scope: McpScope, checked: boolean) {
    onChange(
      checked ? [...value, scope] : value.filter((entry) => entry !== scope),
    );
  }

  return (
    <FieldSet>
      <FieldLegend variant="label">{t("mcpScopesLabel")}</FieldLegend>
      <FieldDescription>{t("mcpScopesDescription")}</FieldDescription>
      <div className="flex flex-col gap-3">
        {SCOPE_GROUPS.map((group) => (
          // A nested fieldset per domain, so a screen reader announces
          // "Bookmarks, Search and read" — six checkboxes share the plain
          // "Search and read" label and would otherwise be indistinguishable.
          <FieldSet key={group.key} className="gap-1.5">
            <FieldLegend variant="label" className="text-sm font-medium">
              {t(group.labelKey)}
            </FieldLegend>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {group.scopes.map(({ scope, accessKey }) => {
                const checkboxId = `${idPrefix}-${scope}`;
                return (
                  <div key={scope} className="flex items-center gap-2">
                    <Checkbox
                      id={checkboxId}
                      checked={value.includes(scope)}
                      onCheckedChange={(checked) =>
                        toggle(scope, checked === true)
                      }
                    />
                    <FieldLabel
                      htmlFor={checkboxId}
                      className="cursor-pointer font-normal"
                    >
                      {t(accessKey)}
                    </FieldLabel>
                  </div>
                );
              })}
            </div>
          </FieldSet>
        ))}
      </div>
    </FieldSet>
  );
}
