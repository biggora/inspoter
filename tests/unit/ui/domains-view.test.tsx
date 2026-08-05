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
  ProviderCredentialDialog: () => <div role="dialog">New provider</div>,
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

      // The header action and the empty-state action share one label, so they
      // are told apart by position: the header comes first in the document.
      const [headerButton, emptyStateButton] = screen.getAllByRole("button", {
        name: "Add Provider",
      });
      await user.click(emptyStateButton);

      expect(screen.getByRole("dialog")).toHaveTextContent("New provider");
      expect(headerButton).toBeInTheDocument();
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
        duplicateCredentialCount: 0,
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
                duplicateCredentialCount: 0,
              },
            ],
          },
        ]}
        categories={[]}
        services={[]}
      />,
    );

    expect(
      screen.getByRole("columnheader", { name: "DNS records" }),
    ).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("DomainsView provider error copy", () => {
  it("maps a new-format error message to its specific translated wording by prefix", () => {
    renderWithIntl(
      <DomainsView
        providers={[
          {
            providerId: "cred-1",
            providerType: "cloudflare",
            mode: "mock",
            domains: [],
            // src/lib/providers/http.ts now appends the HTTP status to this
            // message instead of returning the bare "Authentication failed"
            // constant — the lookup must still resolve to the specific copy.
            error: "Authentication failed (HTTP 401)",
          },
        ]}
        categories={[]}
        services={[]}
      />,
    );

    // The alert prefixes the copy with "<Provider> — ", split across
    // sibling text nodes, so assert via textContent rather than exact
    // getByText (which only matches an element's own direct text nodes).
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Provider authentication failed.");
    expect(alert).not.toHaveTextContent("Failed to fetch data from provider.");
  });

  it("falls back to the generic copy for a genuinely unknown error message", () => {
    renderWithIntl(
      <DomainsView
        providers={[
          {
            providerId: "cred-1",
            providerType: "cloudflare",
            mode: "mock",
            domains: [],
            error: "Something unexpected happened",
          },
        ]}
        categories={[]}
        services={[]}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Failed to fetch data from provider.",
    );
  });
});

describe("DomainsView shared zones", () => {
  it("marks a zone that more than one credential exposes", () => {
    renderWithIntl(
      <DomainsView
        providers={[
          {
            ...PROVIDERS_WITH_DOMAIN[0],
            domains: [
              {
                ...PROVIDERS_WITH_DOMAIN[0].domains[0],
                duplicateCredentialCount: 1,
              },
            ],
          },
        ]}
        categories={[]}
        services={[]}
      />,
    );

    expect(screen.getByText("Also in 1 other connection")).toBeInTheDocument();
  });

  it("leaves an ordinary zone unmarked", () => {
    renderWithIntl(
      <DomainsView
        providers={PROVIDERS_WITH_DOMAIN}
        categories={[]}
        services={[]}
      />,
    );

    expect(screen.queryByText(/Also in/)).not.toBeInTheDocument();
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
      screen.getByRole("button", { name: "Actions for example.com" }),
    );

    expect(
      await screen.findByRole("menuitem", { name: "Add to Monitoring" }),
    ).toBeInTheDocument();
    // No bookmark category exists yet, so filing a bookmark is blocked.
    expect(
      screen.getByRole("menuitem", {
        name: "Create a bookmark category first",
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

    expect(screen.getByText("Monitored")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Actions for example.com" }),
    );

    // The item is a locale-aware <Link>; jsdom + the next/navigation mock
    // render it without its anchor, so assert on the copy, not the role.
    expect(await screen.findByText("Open in Monitoring")).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Add to Monitoring" }),
    ).not.toBeInTheDocument();
  });
});
