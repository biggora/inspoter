// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "../../test-utils";
import { DomainsView } from "@/components/domains/domains-view";
import type { Service } from "@/generated/prisma/client";
import type { DomainsByProvider } from "@/lib/services/domains";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
  usePathname: () => "/",
  // next-intl's locale-aware <Link> (used by the row action menu) reads the
  // route params to keep the current locale prefix.
  useParams: () => ({ locale: "ru" }),
  useSelectedLayoutSegment: () => null,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }),
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
      renderWithIntl(
        <DomainsView providers={providers} categories={[]} services={[]} />,
      );

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

const PROVIDERS_WITH_DOMAIN: DomainsByProvider[] = [
  {
    providerId: "cred-1",
    providerType: "cloudflare",
    mode: "mock",
    domains: [
      {
        id: "zone-1",
        name: "example.com",
        provider: "cloudflare",
        recordCount: 7,
      },
    ],
    error: null,
  },
];

describe("DomainsView record counts", () => {
  it("shows the DNS record count, and a dash when it is unavailable", () => {
    renderWithIntl(
      <DomainsView
        providers={[
          {
            ...PROVIDERS_WITH_DOMAIN[0],
            domains: [
              ...PROVIDERS_WITH_DOMAIN[0].domains,
              {
                id: "zone-2",
                name: "unreadable.dev",
                provider: "cloudflare",
                recordCount: null,
              },
            ],
          },
        ]}
        categories={[]}
        services={[]}
      />,
    );

    expect(
      screen.getByRole("columnheader", { name: "DNS-записи" }),
    ).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("DomainsView bookmark/monitoring actions", () => {
  it("offers to add an unlinked domain to monitoring", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <DomainsView
        providers={PROVIDERS_WITH_DOMAIN}
        categories={[]}
        services={[]}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Действия для example.com" }),
    );

    expect(
      await screen.findByRole("menuitem", { name: "Добавить в мониторинг" }),
    ).toBeInTheDocument();
    // No bookmark category exists yet, so filing a bookmark is blocked.
    expect(
      screen.getByRole("menuitem", {
        name: "Сначала создайте категорию закладок",
      }),
    ).toHaveAttribute("data-disabled");
  });

  it("links to the existing service when the domain is already monitored", async () => {
    const user = userEvent.setup();
    const services: Array<
      Pick<Service, "id" | "monitorType" | "url" | "host">
    > = [
      {
        id: "svc-1",
        monitorType: "HTTP",
        url: "https://example.com",
        host: null,
      },
    ];
    renderWithIntl(
      <DomainsView
        providers={PROVIDERS_WITH_DOMAIN}
        categories={[]}
        services={services}
      />,
    );

    expect(screen.getByText("В мониторинге")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Действия для example.com" }),
    );

    // The item is a locale-aware <Link>; jsdom + the next/navigation mock
    // render it without its anchor, so assert on the copy, not the role.
    expect(await screen.findByText("Открыть мониторинг")).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Добавить в мониторинг" }),
    ).not.toBeInTheDocument();
  });
});
