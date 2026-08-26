import { describe, expect, it } from "vitest";
import {
  applyMailTemplateVariables,
  extractMailTemplateVariables,
  MailTemplateVariableError,
} from "@/lib/mail-template-variables";

describe("mail template variables", () => {
  it("extracts Unicode variables once while preserving their first spelling", () => {
    expect(
      extractMailTemplateVariables(
        "Счёт для {{ Имя клиента }}",
        "Sveiki, {{имя   клиента}}. Termiņš: {{datums_1}}.",
      ),
    ).toEqual(["Имя клиента", "datums_1"]);
  });

  it("substitutes plain text and HTML with escaped values", () => {
    expect(
      applyMailTemplateVariables(
        {
          subject: "Hello {{name}}",
          bodyText: "Welcome, {{name}}!",
          bodyHtml: "<p>Welcome, {{name}}!</p>",
        },
        { name: '<Admin & "team">' },
      ),
    ).toEqual({
      subject: 'Hello <Admin & "team">',
      bodyText: 'Welcome, <Admin & "team">!',
      bodyHtml: "<p>Welcome, &lt;Admin &amp; &quot;team&quot;&gt;!</p>",
    });
  });

  it("requires values and rejects more than twenty variables", () => {
    expect(() =>
      applyMailTemplateVariables(
        { subject: "{{name}}", bodyText: "", bodyHtml: "" },
        {},
      ),
    ).toThrow(MailTemplateVariableError);
    expect(() =>
      extractMailTemplateVariables(
        Array.from({ length: 21 }, (_, index) => `{{field ${index}}}`).join(
          " ",
        ),
      ),
    ).toThrow(MailTemplateVariableError);
  });

  it("rejects empty and overlong variable names", () => {
    expect(() => extractMailTemplateVariables("{{ }}")).toThrow(
      MailTemplateVariableError,
    );
    expect(() => extractMailTemplateVariables(`{{${"a".repeat(51)}}}`)).toThrow(
      MailTemplateVariableError,
    );
  });

  it("extracts variables that occur only in HTML", () => {
    expect(
      extractMailTemplateVariables("", "Visible text", "<p>{{client}}</p>"),
    ).toEqual(["client"]);
  });
});
