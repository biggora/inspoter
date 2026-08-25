"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";

import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { MCP_SCOPES, type McpScope } from "@/lib/mcp/scopes";

// The agent's permission surface, grouped the way an operator thinks about it:
// one row per dashboard section, a read box and a write box. The scope list
// itself comes from src/lib/mcp/scopes.ts, so a scope added there shows up here
// without a second edit — a domain missing a write half simply renders one box.

interface ScopeDomain {
  domain: string;
  read?: McpScope;
  write?: McpScope;
}

// Built once at module load: MCP_SCOPES is a frozen tuple.
const SCOPE_DOMAINS: ScopeDomain[] = (() => {
  const byDomain = new Map<string, ScopeDomain>();
  for (const scope of MCP_SCOPES) {
    const [domain, access] = scope.split(":");
    const entry = byDomain.get(domain) ?? { domain };
    if (access === "write") entry.write = scope;
    else entry.read = scope;
    byDomain.set(domain, entry);
  }
  return [...byDomain.values()];
})();

function domainLabelKey(domain: string): string {
  return `domain${domain.charAt(0).toUpperCase()}${domain.slice(1)}`;
}

interface AgentScopesFieldProps {
  value: readonly McpScope[];
  onChange: (next: McpScope[]) => void;
  disabled?: boolean;
}

export function AgentScopesField({
  value,
  onChange,
  disabled,
}: AgentScopesFieldProps) {
  const t = useTranslations("agents");
  const idPrefix = useId();
  const selected = new Set(value);

  function toggle(scope: McpScope, checked: boolean): void {
    const next = new Set(selected);
    if (checked) {
      next.add(scope);
      // Write without read is a shape the tool catalogue never produces: every
      // write tool needs the ids a read tool hands out, so granting write on
      // its own would only look like permission.
      const pair = SCOPE_DOMAINS.find((entry) => entry.write === scope);
      if (pair?.read) next.add(pair.read);
    } else {
      next.delete(scope);
      const pair = SCOPE_DOMAINS.find((entry) => entry.read === scope);
      if (pair?.write) next.delete(pair.write);
    }
    onChange(MCP_SCOPES.filter((scope) => next.has(scope)));
  }

  return (
    <div className="flex flex-col gap-2">
      {SCOPE_DOMAINS.map((entry) => (
        <div
          key={entry.domain}
          className="flex flex-wrap items-center justify-between gap-3 border-b py-2 last:border-b-0"
        >
          <span className="text-sm font-medium">
            {t(domainLabelKey(entry.domain))}
          </span>
          <div className="flex items-center gap-5">
            {(["read", "write"] as const).map((access) => {
              const scope = entry[access];
              if (!scope) return null;
              const fieldId = `${idPrefix}-${scope}`;
              return (
                <Field key={scope} orientation="horizontal" className="w-auto">
                  <Checkbox
                    id={fieldId}
                    checked={selected.has(scope)}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      toggle(scope, checked === true)
                    }
                  />
                  <FieldLabel
                    htmlFor={fieldId}
                    className="cursor-pointer font-normal"
                  >
                    {access === "read" ? t("scopeRead") : t("scopeWrite")}
                  </FieldLabel>
                </Field>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
