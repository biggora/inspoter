// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadOriginalMessage } from "@/components/mail/api";

vi.mock("@/lib/client/active-workspace", () => ({
  getActiveWorkspaceId: () => "workspace-1",
  WORKSPACE_HEADER_NAME: "x-workspace-id",
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("original message download", () => {
  it("preserves the binary Blob, scopes the request, and saves an eml file", async () => {
    const blob = new Blob([new Uint8Array([0xc4, 0x8c, 0x0d, 0x0a, 0xff])], {
      type: "message/rfc822",
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, blob: async () => blob });
    vi.stubGlobal("fetch", fetchMock);
    const createObjectURL = vi.fn().mockReturnValue("blob:original");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    let downloadedName = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadedName = this.download;
      expect(this.href).toBe("blob:original");
    });
    await downloadOriginalMessage("mail-1", (key) => key);
    expect(fetchMock).toHaveBeenCalledWith("/api/mail/mail-1/original", {
      headers: { "x-workspace-id": "workspace-1" },
      cache: "no-store",
    });
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(downloadedName).toBe("message-mail-1.eml");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:original");
    expect(document.querySelector("a[download]")).toBeNull();
  });

  it("localizes known errors without downloading an error document", async () => {
    const blob = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: "English error",
          errorKey: "errorOriginalTooLarge",
        }),
        blob,
      }),
    );
    const translate = vi.fn().mockReturnValue("Localized error");
    await expect(downloadOriginalMessage("mail-1", translate)).rejects.toThrow(
      "Localized error",
    );
    expect(translate).toHaveBeenCalledWith("errorOriginalTooLarge");
    expect(blob).not.toHaveBeenCalled();
  });

  it("uses the fallback for non-JSON failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => {
          throw new Error("not JSON");
        },
      }),
    );
    await expect(
      downloadOriginalMessage("mail-1", (key) => key),
    ).rejects.toThrow("errorDownloadOriginal");
  });
});
