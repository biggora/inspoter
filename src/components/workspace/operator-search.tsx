"use client";

import { useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { workspacesApi } from "./api";

interface AvailableOperator {
  id: string;
  username: string;
  email: string | null;
}

interface OperatorSearchProps {
  workspaceId: string;
  onSelect: (operator: AvailableOperator) => void;
  disabled?: boolean;
}

export function OperatorSearch({
  workspaceId,
  onSelect,
  disabled,
}: OperatorSearchProps) {
  const t = useTranslations("workspace");
  const [operators, setOperators] = useState<AvailableOperator[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");

  async function fetchOperators() {
    setLoading(true);
    try {
      const result = await workspacesApi.searchOperators(workspaceId);
      setOperators(result);
    } catch {
      setOperators([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Combobox.Root
      items={operators}
      value={null}
      inputValue={inputValue}
      onInputValueChange={setInputValue}
      onValueChange={(operator) => {
        if (operator) {
          onSelect(operator);
          setInputValue("");
        }
      }}
      onOpenChange={(open) => {
        if (open) fetchOperators();
      }}
      itemToStringLabel={(operator: AvailableOperator) => operator.username}
      disabled={disabled}
    >
      <Combobox.Input
        placeholder={t("searchOperatorPlaceholder")}
        disabled={disabled || loading}
        className={cn(
          "flex h-[var(--control-md)] w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-sunken)] px-2.5 text-sm transition-colors outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:px-2 file:text-sm file:font-medium placeholder:text-[var(--text-placeholder)] focus-visible:border-[var(--focus-ring)] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-0 focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        )}
      />
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="isolate z-50">
          <Combobox.Popup className="relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <Combobox.Empty className="py-4 text-center text-sm text-muted-foreground">
              {t("noOperatorsFound")}
            </Combobox.Empty>
            <Combobox.List className="scroll-my-1 p-1">
              {(operator: AvailableOperator) => (
                <Combobox.Item
                  key={operator.id}
                  value={operator}
                  className="relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1.5 px-2 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50"
                >
                  <span>{operator.username}</span>
                  {operator.email && (
                    <span className="text-muted-foreground">
                      ({operator.email})
                    </span>
                  )}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
