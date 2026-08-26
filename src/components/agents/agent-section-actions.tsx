"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

type AgentSection = "chats" | "agents" | "runs" | "skills";

interface AgentSectionActionsProps {
  current: AgentSection;
  children?: ReactNode;
}

const SECTIONS: Array<{
  key: AgentSection;
  href: string;
  labelKey:
    "chatsButton" | "backToAgents" | "runsButton" | "manageSkillsButton";
  icon: string;
}> = [
  {
    key: "chats",
    href: "/agents",
    labelKey: "chatsButton",
    icon: "ri-message-2-line",
  },
  {
    key: "agents",
    href: "/agents/agents",
    labelKey: "backToAgents",
    icon: "ri-robot-2-line",
  },
  {
    key: "runs",
    href: "/agents/runs",
    labelKey: "runsButton",
    icon: "ri-play-circle-line",
  },
  {
    key: "skills",
    href: "/agents/skills",
    labelKey: "manageSkillsButton",
    icon: "ri-lightbulb-line",
  },
];

export function AgentSectionActions({
  current,
  children,
}: AgentSectionActionsProps) {
  const t = useTranslations("agents");

  return (
    <>
      {SECTIONS.filter((section) => section.key !== current).map((section) => (
        <Button
          key={section.key}
          render={<Link href={section.href} />}
          nativeButton={false}
          variant="outline"
        >
          <Icon name={section.icon} aria-hidden data-icon="inline-start" />
          {t(section.labelKey)}
        </Button>
      ))}
      {children}
    </>
  );
}
