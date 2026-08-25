import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  eventToTelegramMessage,
  TELEGRAM_MESSAGE_MAX,
} from "@/lib/telegram/message";

// Telegram's HTML parse mode rejects an unescaped "<", so anything a dashboard
// row can contain has to survive the trip as text rather than as markup.

describe("escapeHtml", () => {
  it("escapes exactly the three entities Telegram's parser needs", () => {
    expect(escapeHtml(`a & b < c > d "e" 'f'`)).toBe(
      `a &amp; b &lt; c &gt; d "e" 'f'`,
    );
  });
});

describe("eventToTelegramMessage — AGENT_RUN_COMPLETED", () => {
  it("leads with the agent name and carries the report", () => {
    const message = eventToTelegramMessage("AGENT_RUN_COMPLETED", {
      agentName: "Night watch",
      status: "SUCCEEDED",
      summary: "Nothing broke overnight.",
      steps: 3,
      toolCalls: 1,
      totalTokens: 420,
    });

    expect(message).toContain("<b>Night watch</b>");
    expect(message).toContain("Nothing broke overnight.");
    expect(message).toContain("Status: SUCCEEDED");
    expect(message).toContain("Steps: 3");
    expect(message).toContain("Tokens: 420");
    expect(message).toContain("AGENT_RUN_COMPLETED");
  });

  it("falls back to the error when there was no report", () => {
    const message = eventToTelegramMessage("AGENT_RUN_COMPLETED", {
      agentName: "Night watch",
      status: "FAILED",
      summary: null,
      error: "Step limit reached (8) before the agent answered.",
    });
    expect(message).toContain("Step limit reached");
  });

  it("escapes a report that contains markup", () => {
    const message = eventToTelegramMessage("AGENT_RUN_COMPLETED", {
      agentName: "Night <watch>",
      summary: "found <script>alert(1)</script> in a log line",
    });
    expect(message).toContain("Night &lt;watch&gt;");
    expect(message).toContain("&lt;script&gt;");
    expect(message).not.toContain("<script>");
  });

  it("clamps a very long report to Telegram's message limit", () => {
    const message = eventToTelegramMessage("AGENT_RUN_COMPLETED", {
      agentName: "Chatty",
      summary: "x".repeat(TELEGRAM_MESSAGE_MAX * 2),
    });
    expect(message.length).toBe(TELEGRAM_MESSAGE_MAX);
    expect(message.endsWith("…")).toBe(true);
  });
});

describe("eventToTelegramMessage — other events", () => {
  it("renders an alert", () => {
    const message = eventToTelegramMessage("ALERT_CREATED", {
      category: "Disk",
      message: "Disk almost full",
      severity: "critical",
    });
    expect(message).toContain("<b>Disk</b>");
    expect(message).toContain("Severity: critical");
  });

  it("renders the test delivery recognisably", () => {
    const message = eventToTelegramMessage("ALERT_CREATED", {
      test: true,
      message: "Inspot outgoing webhook test delivery",
    });
    expect(message).toContain("Inspoter test delivery");
    expect(message).toContain("test delivery");
  });
});
