// @vitest-environment jsdom

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "../../test-utils";
import { LoginForm } from "@/app/[locale]/login/login-form";
import { BookmarkDialog } from "@/components/bookmarks/bookmark-dialog";
import { CategoryDialog } from "@/components/bookmarks/category-dialog";
import { ServiceFormDialog } from "@/components/services/service-form-dialog";
import { ApiError as CredentialApiError } from "@/components/settings/credentials-api";
import { ProviderCredentialDialog } from "@/components/settings/provider-credential-dialog";
import type { CategoryWithBookmarks } from "@/lib/services/bookmarks";

const mocks = vi.hoisted(() => ({
  bookmarksCreate: vi.fn(),
  bookmarksUpdate: vi.fn(),
  categoriesCreate: vi.fn(),
  categoriesRename: vi.fn(),
  credentialsCreate: vi.fn(),
  credentialsUpdate: vi.fn(),
  login: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  servicesCreate: vi.fn(),
  servicesUpdate: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
  usePathname: () => "/",
  useRouter: () => ({
    push: mocks.push,
    replace: vi.fn(),
    prefetch: vi.fn(),
    refresh: mocks.refresh,
  }),
}));

vi.mock("@/app/[locale]/login/actions", () => ({ login: mocks.login }));

vi.mock("@/components/bookmarks/api", () => {
  class ApiError extends Error {
    fieldErrors?: Record<string, string>;

    constructor(message: string, fieldErrors?: Record<string, string>) {
      super(message);
      this.fieldErrors = fieldErrors;
    }
  }

  return {
    ApiError,
    bookmarkFaviconApi: { suggest: vi.fn() },
    bookmarksApi: {
      create: mocks.bookmarksCreate,
      update: mocks.bookmarksUpdate,
    },
    categoriesApi: {
      create: mocks.categoriesCreate,
      rename: mocks.categoriesRename,
    },
  };
});

vi.mock("@/components/services/api", () => {
  class ApiError extends Error {
    fieldErrors?: Record<string, string>;
  }

  return {
    ApiError,
    servicesApi: {
      create: mocks.servicesCreate,
      update: mocks.servicesUpdate,
    },
  };
});

vi.mock("@/components/settings/credentials-api", () => {
  class ApiError extends Error {
    fieldErrors?: Record<string, string>;

    constructor(message: string, fieldErrors?: Record<string, string>) {
      super(message);
      this.fieldErrors = fieldErrors;
    }
  }

  return {
    ApiError,
    credentialsApi: {
      create: mocks.credentialsCreate,
      update: mocks.credentialsUpdate,
    },
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe("standardized form contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.login.mockResolvedValue({
      ok: false,
      error: "Invalid username or password.",
    });
    mocks.servicesCreate.mockResolvedValue({ id: "service-1" });
    mocks.bookmarksCreate.mockResolvedValue({ id: "bookmark-1" });
    mocks.categoriesCreate.mockResolvedValue({ id: "category-1" });
    mocks.credentialsCreate.mockResolvedValue({ id: "credential-1" });
  });

  it("keeps the login reveal action non-submit and submits once on Enter", async () => {
    const user = userEvent.setup();

    renderWithIntl(<LoginForm />);
    const username = screen.getByLabelText("Username");
    const password = screen.getByLabelText("Password");
    const reveal = screen.getByRole("button", { name: "Show password" });

    expect(reveal).toHaveAttribute("type", "button");
    await user.click(reveal);
    expect(mocks.login).not.toHaveBeenCalled();
    expect(password).toHaveAttribute("type", "text");

    await user.type(username, "operator");
    await user.type(password, "secret{Enter}");

    await waitFor(() => expect(mocks.login).toHaveBeenCalledTimes(1));
    const submitted = mocks.login.mock.calls[0][0] as FormData;
    expect(submitted.get("username")).toBe("operator");
    expect(submitted.get("password")).toBe("secret");
  });

  it("disables every login control and shows a spinner while pending", async () => {
    const user = userEvent.setup();
    const loginResult = deferred<{
      ok: false;
      error: "Invalid username or password.";
    }>();
    mocks.login.mockReturnValueOnce(loginResult.promise);

    renderWithIntl(<LoginForm />);
    const username = screen.getByLabelText("Username");
    const password = screen.getByLabelText("Password");
    const reveal = screen.getByRole("button", { name: "Show password" });
    const submit = screen.getByRole("button", { name: "Sign in" });

    await user.type(username, "operator");
    await user.type(password, "secret");
    await user.click(submit);
    await waitFor(() => expect(mocks.login).toHaveBeenCalledTimes(1));

    expect(username).toBeDisabled();
    expect(password).toBeDisabled();
    expect(reveal).toBeDisabled();
    expect(submit).toBeDisabled();
    expect(submit.querySelector('[data-slot="spinner"]')).toBeInTheDocument();

    loginResult.resolve({
      ok: false,
      error: "Invalid username or password.",
    });
    await waitFor(() => expect(username).not.toBeDisabled());
    expect(reveal).not.toBeDisabled();
  });

  it("preserves the encoded Authentik next target and redirects safely", async () => {
    const user = userEvent.setup();
    const next = "//evil.example/steal?token=1";
    mocks.login.mockResolvedValueOnce({ ok: true });

    renderWithIntl(<LoginForm next={next} authentikEnabled />);
    expect(
      screen.getByRole("button", { name: "Sign in with Authentik" }),
    ).toHaveAttribute(
      "href",
      "/api/auth/authentik/login?next=%2F%2Fevil.example%2Fsteal%3Ftoken%3D1",
    );

    await user.type(screen.getByLabelText("Username"), "operator");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    // An unsafe `next` falls back to the post-login landing path, not to the
    // attacker's target.
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboards"));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("submits the selected category from the real bookmark dialog", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <BookmarkDialog
        state={{ mode: "create", categoryId: "category-a" }}
        categories={[
          { id: "category-a", name: "Alpha" },
          { id: "category-b", name: "Beta" },
        ]}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Name"), "Documentation");
    await user.type(screen.getByLabelText("URL"), "https://example.com/docs");
    const category = screen.getByRole("combobox", { name: "Category" });
    expect(category).toHaveValue("category-a");
    await user.selectOptions(category, "category-b");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(mocks.bookmarksCreate).toHaveBeenCalledTimes(1));
    expect(mocks.bookmarksCreate).toHaveBeenCalledWith({
      categoryId: "category-b",
      color: null,
      description: null,
      icon: null,
      name: "Documentation",
      url: "https://example.com/docs",
    });
  });

  it("maps the real category dialog empty parent to null and disables invalid nesting", async () => {
    const user = userEvent.setup();
    const now = new Date("2026-07-17T00:00:00.000Z");
    const categories: CategoryWithBookmarks[] = [
      {
        id: "category-a",
        workspaceId: "workspace-1",
        name: "Alpha",
        position: 0,
        parentCategoryId: null,
        parentCategoryWorkspaceId: null,
        createdAt: now,
        updatedAt: now,
        bookmarks: [],
        childCategories: [],
      },
    ];

    const createView = renderWithIntl(
      <CategoryDialog
        state={{ mode: "create" }}
        topLevelCategories={categories}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const parent = screen.getByRole("combobox", {
      name: "Parent Category",
    });
    expect(parent).toHaveValue("");
    await user.type(screen.getByLabelText("Name"), "New root");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(mocks.categoriesCreate).toHaveBeenCalledTimes(1),
    );
    expect(mocks.categoriesCreate).toHaveBeenCalledWith("New root", null);
    createView.unmount();

    const child = {
      id: "category-child",
      workspaceId: "workspace-1",
      name: "Child",
      position: 0,
      parentCategoryId: "category-a",
      parentCategoryWorkspaceId: "workspace-1",
      createdAt: now,
      updatedAt: now,
      bookmarks: [],
    };
    const categoryWithChild: CategoryWithBookmarks = {
      ...categories[0],
      childCategories: [child],
    };

    renderWithIntl(
      <CategoryDialog
        state={{ mode: "edit", category: categoryWithChild }}
        topLevelCategories={[categoryWithChild]}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("combobox", { name: "Parent Category" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/This category has subcategories/),
    ).toBeInTheDocument();
  });

  it("toggles the service checkbox by label and Space and submits a boolean", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <ServiceFormDialog
        state={{ mode: "create" }}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const checkbox = screen.getByRole("checkbox", {
      name: "Active (check on schedule)",
    });
    await user.click(screen.getByText("Active (check on schedule)"));
    expect(checkbox).not.toBeChecked();
    checkbox.focus();
    await user.keyboard(" ");
    expect(checkbox).toBeChecked();
    await user.click(screen.getByText("Active (check on schedule)"));
    expect(checkbox).not.toBeChecked();

    await user.type(screen.getByLabelText("Name"), "Status page");
    await user.type(screen.getByLabelText("URL"), "https://example.com/health");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(mocks.servicesCreate).toHaveBeenCalledTimes(1));
    expect(mocks.servicesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        isActive: false,
        monitorType: "HTTP",
        name: "Status page",
        url: "https://example.com/health",
      }),
    );
  });

  it("associates provider, label, and dynamic secret errors with their controls", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <ProviderCredentialDialog
        open
        mode="create"
        existing={null}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const submit = screen.getByRole("button", { name: "Save" });
    const provider = screen.getByRole("combobox", { name: "Provider" });
    await user.click(submit);
    expect(provider).toHaveAttribute("aria-invalid", "true");
    expect(provider).toHaveAccessibleDescription("Select a provider.");
    expect(screen.getByLabelText("Name")).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );

    await user.click(provider);
    await user.click(
      await screen.findByRole("option", { name: "Cloudflare (DNS)" }),
    );
    await user.click(submit);
    const label = screen.getByLabelText("Name");
    expect(label).toHaveAttribute("aria-invalid", "true");
    expect(label).toHaveAccessibleDescription("Name is required.");
    expect(provider).not.toHaveAttribute("aria-invalid", "true");

    await user.type(label, "Primary account");
    await user.click(submit);
    const secret = screen.getByLabelText("API token");
    expect(secret).toHaveAttribute("aria-invalid", "true");
    expect(secret).toHaveAccessibleDescription(
      'Field "API token" is required.',
    );
    expect(provider).not.toHaveAttribute("aria-invalid", "true");
    expect(label).not.toHaveAttribute("aria-invalid", "true");
  });

  it("submits an OpenAI-compatible credential with its base URL, model and key", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <ProviderCredentialDialog
        open
        mode="create"
        existing={null}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Provider" }));
    await user.click(
      await screen.findByRole("option", { name: "OpenAI-compatible (LLM)" }),
    );

    await user.type(screen.getByLabelText("Name"), "Local model");
    await user.type(
      screen.getByLabelText("API base URL"),
      "http://127.0.0.1:11434/v1",
    );
    await user.type(screen.getByLabelText("Model"), "llama3.1");
    // The key is the only secret field of the three.
    const apiKey = screen.getByLabelText("API key");
    expect(apiKey).toHaveAttribute("type", "password");
    await user.type(apiKey, "llm-key-value");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mocks.credentialsCreate).toHaveBeenCalledWith({
      provider: "OPENAI_COMPATIBLE",
      label: "Local model",
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "llama3.1",
      apiKey: "llm-key-value",
    });
  });

  it("submits an Anthropic-compatible credential through the same three fields", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <ProviderCredentialDialog
        open
        mode="create"
        existing={null}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Provider" }));
    await user.click(
      await screen.findByRole("option", { name: "Anthropic-compatible (LLM)" }),
    );

    // The transport is the only difference between the two LLM entries, so an
    // operator types the same three fields either way.
    await user.type(screen.getByLabelText("Name"), "GLM");
    await user.type(
      screen.getByLabelText("API base URL"),
      "https://api.z.ai/api/anthropic",
    );
    await user.type(screen.getByLabelText("Model"), "glm-4.6");
    const apiKey = screen.getByLabelText("API key");
    expect(apiKey).toHaveAttribute("type", "password");
    await user.type(apiKey, "zai-key-value");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mocks.credentialsCreate).toHaveBeenCalledWith({
      provider: "ANTHROPIC_COMPATIBLE",
      label: "GLM",
      baseUrl: "https://api.z.ai/api/anthropic",
      model: "glm-4.6",
      apiKey: "zai-key-value",
    });
  });

  it("renders generic provider API failures at form level without invalidating fields", async () => {
    const user = userEvent.setup();
    mocks.credentialsCreate.mockRejectedValueOnce(
      new CredentialApiError("Provider is temporarily unavailable."),
    );

    renderWithIntl(
      <ProviderCredentialDialog
        open
        mode="create"
        existing={null}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const provider = screen.getByRole("combobox", { name: "Provider" });
    await user.click(provider);
    await user.click(
      await screen.findByRole("option", { name: "Cloudflare (DNS)" }),
    );
    const label = screen.getByLabelText("Name");
    const secret = screen.getByLabelText("API token");
    await user.type(label, "Primary account");
    await user.type(secret, "token-value");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByRole("alert", {
        name: "",
      }),
    ).toHaveTextContent("Provider is temporarily unavailable.");
    expect(provider).not.toHaveAttribute("aria-invalid", "true");
    expect(label).not.toHaveAttribute("aria-invalid", "true");
    expect(secret).not.toHaveAttribute("aria-invalid", "true");
  });
});
