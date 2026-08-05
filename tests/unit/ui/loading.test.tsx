// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { LoadingOverlay, LoadingRegion } from "@/components/ui/loading";
import {
  CardGridSkeleton,
  ListSkeleton,
  TableSkeleton,
} from "@/components/ui/skeletons";
import { renderWithIntl } from "../../test-utils";

describe("LoadingRegion", () => {
  it("marks the region busy and announces a localized status", () => {
    renderWithIntl(
      <LoadingRegion>
        <TableSkeleton rows={4} />
      </LoadingRegion>,
    );

    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(region).toHaveTextContent("Loading…");
  });

  it("prefers a caller-supplied label over the generic one", () => {
    renderWithIntl(
      <LoadingRegion label="Loading webhooks">
        <TableSkeleton rows={1} />
      </LoadingRegion>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Loading webhooks");
  });
});

describe("LoadingOverlay", () => {
  it("renders the content untouched when idle", () => {
    renderWithIntl(
      <LoadingOverlay busy={false}>
        <p>Confirmed content</p>
      </LoadingOverlay>,
    );

    expect(screen.getByText("Confirmed content")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="loading-overlay"]'),
    ).not.toHaveAttribute("aria-busy");
  });

  it("keeps the confirmed content and adds a spinner while busy", () => {
    renderWithIntl(
      <LoadingOverlay busy>
        <p>Confirmed content</p>
      </LoadingOverlay>,
    );

    // The rows the operator was reading stay on screen — only a veil is added.
    expect(screen.getByText("Confirmed content")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    expect(
      document.querySelector('[data-slot="loading-overlay"]'),
    ).toHaveAttribute("aria-busy", "true");
    expect(document.querySelector('[data-slot="spinner"]')).toBeInTheDocument();
  });
});

describe("skeleton presets", () => {
  it("renders one table row per requested row", () => {
    renderWithIntl(<TableSkeleton rows={6} />);
    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(6);
  });

  it("drops the metric rows and footer a caller does not ask for", () => {
    const { container } = renderWithIntl(
      <CardGridSkeleton cards={2} metricRows={0} footerActions={0} />,
    );

    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(2);
    expect(
      container.querySelectorAll('[data-slot="card-content"]'),
    ).toHaveLength(0);
    expect(
      container.querySelectorAll('[data-slot="card-footer"]'),
    ).toHaveLength(0);
  });

  it("adds the avatar and trailing meta columns only when asked", () => {
    const { container, rerender } = renderWithIntl(<ListSkeleton rows={1} />);
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
      2,
    );

    rerender(<ListSkeleton rows={1} avatar trailing />);
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
      4,
    );
  });
});
