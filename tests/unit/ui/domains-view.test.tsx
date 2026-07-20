// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "../../test-utils";
import { DomainsView } from "@/components/domains/domains-view";
import type { DomainsByProvider } from "@/lib/services/domains";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/components/settings/provider-credential-dialog", () => ({
  ProviderCredentialDialog: () => <div role="dialog">Новый провайдер</div>,
}));

describe("DomainsView empty state", () => {
  it.each([
    ["without providers", []],
    [
      "with an errored provider",
      [
        {
          providerId: "cred-1",
          providerType: "cloudflare",
          mode: "mock",
          domains: [],
          error: "Provider unreachable",
        },
      ],
    ],
  ] satisfies [string, DomainsByProvider[]][])(
    "opens the create-provider dialog $0",
    async (_, providers) => {
      const user = userEvent.setup();
      renderWithIntl(<DomainsView providers={providers} />);

      await user.click(
        screen.getByRole("button", { name: "Добавить провайдера" }),
      );

      expect(screen.getByRole("dialog")).toHaveTextContent("Новый провайдер");
      expect(
        screen.getByRole("button", { name: "Добавить провайдер" }),
      ).toBeInTheDocument();
    },
  );
});
