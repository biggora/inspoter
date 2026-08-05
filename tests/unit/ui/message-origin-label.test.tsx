// @vitest-environment jsdom

import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import { MessageTimeline } from "@/components/messages/message-timeline";
import type { MessageDto } from "@/components/messages/api";
import { renderWithIntl } from "../../test-utils";

// Provenance is the whole point of MessageOrigin: an operator reading the
// channel must be able to tell a message an agent wrote over the API from one
// a colleague typed and from one a webhook delivered.

function message(
  id: string,
  origin: MessageDto["origin"],
  author: string,
): MessageDto {
  return {
    id,
    channelId: "channel-1",
    content: `content ${id}`,
    author,
    origin,
    createdAt: "2026-08-05T10:15:00.000Z",
  };
}

function renderTimeline(messages: MessageDto[]) {
  renderWithIntl(
    <MessageTimeline
      channelName="ops"
      messages={messages}
      loading={false}
      loadingPrevious={false}
      error={null}
      hasPrevious={false}
      scrollRef={createRef<HTMLDivElement>()}
      onRetry={vi.fn()}
      onLoadPrevious={vi.fn()}
    />,
  );
}

describe("message origin labels", () => {
  it("labels an agent-written message distinctly from the other origins", () => {
    renderTimeline([
      message("1", "AGENT", "release-bot"),
      message("2", "OPERATOR", "admin"),
      message("3", "WEBHOOK", "ci"),
      message("4", "LEGACY", "old"),
    ]);

    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("Operator")).toBeInTheDocument();
    expect(screen.getByText("External source")).toBeInTheDocument();
    expect(screen.getByText("Source unknown")).toBeInTheDocument();
  });
});
