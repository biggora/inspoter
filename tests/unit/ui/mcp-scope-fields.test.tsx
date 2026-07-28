// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { McpScopeFields } from "@/components/settings/mcp-scope-fields";
import { MCP_SCOPES } from "@/lib/mcp/scopes";
import { renderWithIntl } from "../../test-utils";

// The scope picker is the only place an operator grants an MCP token access to
// workspace data, so the checkbox set has to stay in step with MCP_SCOPES.

describe("McpScopeFields", () => {
  it("renders one checkbox per declared scope", () => {
    renderWithIntl(<McpScopeFields value={[]} onChange={vi.fn()} />);

    expect(screen.getAllByRole("checkbox")).toHaveLength(MCP_SCOPES.length);
  });

  it("names each domain group so its checkboxes are distinguishable", () => {
    renderWithIntl(<McpScopeFields value={[]} onChange={vi.fn()} />);

    // Six domains share the plain "Поиск и чтение" label; the enclosing
    // fieldset legend is what tells them apart for assistive technology.
    for (const label of [
      "Почта",
      "Алерты",
      "Закладки",
      "Серверы",
      "Сервисы",
      "Логи",
    ]) {
      expect(screen.getByRole("group", { name: label })).toBeInTheDocument();
    }
    expect(
      screen.getAllByRole("checkbox", { name: "Поиск и чтение" }),
    ).toHaveLength(6);
    expect(
      screen.getByRole("checkbox", { name: "Черновики и отправка" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Создание" }),
    ).toBeInTheDocument();
  });

  it("reflects the granted scopes as checked boxes", () => {
    renderWithIntl(
      <McpScopeFields value={["mail:write"]} onChange={vi.fn()} />,
    );

    expect(
      screen.getByRole("checkbox", { name: "Черновики и отправка" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Создание" }),
    ).not.toBeChecked();
  });

  it("adds a scope when its box is checked", async () => {
    const onChange = vi.fn();
    renderWithIntl(<McpScopeFields value={[]} onChange={onChange} />);

    await userEvent.click(
      screen.getByRole("checkbox", { name: "Черновики и отправка" }),
    );

    expect(onChange).toHaveBeenCalledWith(["mail:write"]);
  });

  it("removes a scope when its box is cleared, keeping the others", async () => {
    const onChange = vi.fn();
    renderWithIntl(
      <McpScopeFields
        value={["mail:read", "mail:write"]}
        onChange={onChange}
      />,
    );

    await userEvent.click(
      screen.getByRole("checkbox", { name: "Черновики и отправка" }),
    );

    expect(onChange).toHaveBeenCalledWith(["mail:read"]);
  });
});
