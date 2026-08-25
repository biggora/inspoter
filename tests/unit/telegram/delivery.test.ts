import { describe, expect, it } from "vitest";
import {
  buildTelegramRequest,
  classifyTelegramResponse,
  redactTelegramToken,
  TELEGRAM_API_BASE,
} from "@/lib/telegram/delivery";

const TOKEN = "123456789:AAFakeTokenForTestsOnly_1234567890";

describe("buildTelegramRequest", () => {
  it("puts the token in the path and the chat in the body", () => {
    const request = buildTelegramRequest({
      apiBase: TELEGRAM_API_BASE,
      botToken: TOKEN,
      chatId: "-1001234567890",
      event: "AGENT_RUN_COMPLETED",
      data: { agentName: "Night watch", summary: "All quiet." },
    });

    expect(request.url).toBe(
      `https://api.telegram.org/bot${TOKEN}/sendMessage`,
    );
    const body = JSON.parse(request.body) as Record<string, unknown>;
    expect(body.chat_id).toBe("-1001234567890");
    expect(body.parse_mode).toBe("HTML");
    expect(body.disable_web_page_preview).toBe(true);
    expect(String(body.text)).toContain("Night watch");
  });

  it("accepts a self-hosted Bot API base with a trailing slash", () => {
    const request = buildTelegramRequest({
      apiBase: "https://bot.example.com/",
      botToken: TOKEN,
      chatId: "1",
      event: "ALERT_CREATED",
      data: {},
    });
    expect(request.url).toBe(`https://bot.example.com/bot${TOKEN}/sendMessage`);
  });
});

describe("classifyTelegramResponse", () => {
  it("accepts a real success", () => {
    expect(classifyTelegramResponse(200, '{"ok":true,"result":{}}')).toEqual({
      ok: true,
      permanent: false,
      retryAfterMs: null,
      message: null,
    });
  });

  it("treats HTTP 200 with ok:false as a failure", () => {
    // Telegram answers some failures with a 200 body; trusting the status
    // alone would record a delivery that never arrived.
    const outcome = classifyTelegramResponse(
      200,
      '{"ok":false,"error_code":400,"description":"Bad Request: chat not found"}',
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.permanent).toBe(true);
    expect(outcome.message).toContain("chat not found");
  });

  it("honours retry_after on a throttle", () => {
    const outcome = classifyTelegramResponse(
      429,
      '{"ok":false,"error_code":429,"description":"Too Many Requests","parameters":{"retry_after":17}}',
    );
    expect(outcome.permanent).toBe(false);
    expect(outcome.retryAfterMs).toBe(17_000);
  });

  it("classifies a blocked bot as permanent and a server error as transient", () => {
    expect(
      classifyTelegramResponse(
        403,
        '{"ok":false,"error_code":403,"description":"Forbidden: bot was blocked by the user"}',
      ).permanent,
    ).toBe(true);
    expect(
      classifyTelegramResponse(502, "<html>bad gateway</html>").permanent,
    ).toBe(false);
  });
});

describe("redactTelegramToken", () => {
  it("removes this webhook's own token", () => {
    const echoed = `POST https://api.telegram.org/bot${TOKEN}/sendMessage failed`;
    const redacted = redactTelegramToken(echoed, TOKEN);
    expect(redacted).not.toContain(TOKEN);
    expect(redacted).toContain("***");
  });

  it("removes a token shaped like Telegram's even when it is not ours", () => {
    const echoed =
      "upstream /bot987654321:BBSomeoneElsesTokenThatIsLong/sendMessage";
    expect(redactTelegramToken(echoed, null)).toBe(
      "upstream /bot***/sendMessage",
    );
  });

  it("leaves an unrelated message alone", () => {
    expect(redactTelegramToken("HTTP 502", TOKEN)).toBe("HTTP 502");
  });
});
