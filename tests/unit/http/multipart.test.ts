import { describe, expect, it } from "vitest";
import { MultipartTooLargeError, readMultipart } from "@/lib/http/multipart";

function multipartRequest(contents: string): Request {
  const form = new FormData();
  form.set("mode", "merge");
  form.set("file", new File([contents], "fixture.txt", { type: "text/plain" }));
  return new Request("http://localhost/upload", { method: "POST", body: form });
}

describe("readMultipart", () => {
  it("reads fields and files without relying on Content-Length", async () => {
    const request = multipartRequest("hello");
    expect(request.headers.has("content-length")).toBe(false);
    const result = await readMultipart(request, {
      maxBodyBytes: 1024,
      maxFileBytes: 10,
      maxFiles: 1,
      maxFields: 1,
      maxParts: 2,
    });
    expect(result.fields.get("mode")).toBe("merge");
    expect(result.files[0]?.data.toString("utf8")).toBe("hello");
  });

  it("rejects an oversized chunked file", async () => {
    await expect(
      readMultipart(multipartRequest("too large"), {
        maxBodyBytes: 1024,
        maxFileBytes: 3,
        maxFiles: 1,
        maxFields: 1,
        maxParts: 2,
      }),
    ).rejects.toBeInstanceOf(MultipartTooLargeError);
  });
});
