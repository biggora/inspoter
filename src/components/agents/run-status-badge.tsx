"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { AgentRunSummary } from "@/lib/services/agent-runs";

// Shared by the run list and the run detail so a status never reads one way in
// one place and another way in the other.
const VARIANT: Record<
  AgentRunSummary["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  PENDING: "outline",
  RUNNING: "secondary",
  SUCCEEDED: "default",
  FAILED: "destructive",
  CANCELLED: "outline",
};

export function RunStatusBadge({
  status,
}: {
  status: AgentRunSummary["status"];
}) {
  const t = useTranslations("agents");
  return <Badge variant={VARIANT[status]}>{t(`runStatus${status}`)}</Badge>;
}
