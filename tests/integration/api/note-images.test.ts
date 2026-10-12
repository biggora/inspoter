import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { AuthContext } from "@/lib/auth/dal";
import { WorkspaceContextRequiredError } from "@/lib/auth/dal";
import type { Operator, Workspace } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { NOTE_IMAGE_MAX_BYTES, isNoteImageUrl } from "@/lib/notes/images";

const auth = vi.hoisted(() => ({
  context: null as AuthContext | null,
  reject: null as Error | null,
}));

vi.mock("@/lib/auth/dal", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/dal")>();
  return {
    ...actual,
    requireAuthWithWorkspaceHeader: vi.fn(async () => {
      if (auth.reject) throw auth.reject;
      return auth.context!;
    }),
    // The GET route authenticates with requireAuth() alone (no workspace
    // header); the real header-less path is covered by
    // note-images-session.test.ts.
    requireAuth: vi.fn(async () => {
      if (auth.reject) throw auth.reject;
      return auth.context!;
    }),
  };
});

const PREFIX = `note-images-api-${randomUUID()}`;
let operator: Operator;
let main: Workspace;
let other: Workspace;

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngBytes(): Uint8Array {
  const tail = Buffer.from(randomUUID());
  const out = new Uint8Array(PNG_HEADER.length + tail.length);
  out.set(PNG_HEADER, 0);
  out.set(tail, PNG_HEADER.length);
  return out;
}

function uploadRequest(
  bytes: Uint8Array,
  { field = "file", filename = "photo.png", type = "image/png" } = {},
) {
  const form = new FormData();
  form.append(field, new Blob([new Uint8Array(bytes)], { type }), filename);
  return new NextRequest("http://localhost/api/notes/images", {
    method: "POST",
    headers: { "X-Inspoter-Workspace": main.id },
    body: form,
  });
}

function fetchRequest(id: string) {
  return new NextRequest(`http://localhost/api/notes/images/${id}`, {
    method: "GET",
  });
}

async function upload(
  bytes: Uint8Array,
  options?: Parameters<typeof uploadRequest>[1],
) {
  const { POST } = await import("@/app/api/notes/images/route");
  return POST(uploadRequest(bytes, options));
}

async function fetchImage(id: string) {
  const { GET } = await import("@/app/api/notes/images/[id]/route");
  return GET(fetchRequest(id), { params: Promise.resolve({ id }) });
}

beforeAll(async () => {
  operator = await db.operator.create({
    data: { username: `${PREFIX}-operator` },
  });
  [main, other] = await Promise.all([
    db.workspace.create({
      data: {
        name: `${PREFIX}-main`,
        slug: `${PREFIX}-main`,
        members: { create: { operatorId: operator.id, role: "OWNER" } },
      },
    }),
    db.workspace.create({
      data: {
        name: `${PREFIX}-other`,
        slug: `${PREFIX}-other`,
        members: { create: { operatorId: operator.id, role: "OWNER" } },
      },
    }),
  ]);
});

beforeEach(async () => {
  auth.context = { workspace: main, operator };
  auth.reject = null;
  await db.noteImage.deleteMany({
    where: { workspaceId: { in: [main.id, other.id] } },
  });
});

afterAll(async () => {
  await db.workspace.deleteMany({ where: { id: { in: [main.id, other.id] } } });
  await db.operator.deleteMany({ where: { id: operator.id } });
});

describe("POST /api/notes/images", () => {
  it("stores a PNG and returns its id, url and markdown", async () => {
    const response = await upload(pngBytes());
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["id", "markdown", "url"]);
    expect(body.url).toBe(`/api/notes/images/${body.id}`);
    expect(body.markdown).toBe(`![](/api/notes/images/${body.id})`);
    expect(isNoteImageUrl(body.url)).toBe(true);
  });

  it("returns the same id for the same bytes", async () => {
    const bytes = pngBytes();
    const first = await (await upload(bytes)).json();
    const second = await (await upload(bytes)).json();
    expect(second.id).toBe(first.id);
  });

  it("rejects text uploaded as image/png with 415 and stores nothing", async () => {
    const response = await upload(
      new Uint8Array(Buffer.from("<html>not an image</html>")),
      { filename: "evil.png", type: "image/png" },
    );
    expect(response.status).toBe(415);
    expect((await response.json()).error).toBe("NOTE_IMAGE_UNSUPPORTED_TYPE");
    expect(await db.noteImage.count({ where: { workspaceId: main.id } })).toBe(
      0,
    );
  });

  it("rejects SVG with 415", async () => {
    const response = await upload(
      new Uint8Array(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
      { filename: "x.svg", type: "image/svg+xml" },
    );
    expect(response.status).toBe(415);
    expect((await response.json()).error).toBe("NOTE_IMAGE_UNSUPPORTED_TYPE");
  });

  it("accepts an image of exactly the maximum size", async () => {
    const exact = new Uint8Array(NOTE_IMAGE_MAX_BYTES);
    exact.set(PNG_HEADER, 0);
    const response = await upload(exact);
    expect(response.status).toBe(201);
    const { id } = await response.json();
    const row = await db.noteImage.findUniqueOrThrow({ where: { id } });
    expect(row.byteSize).toBe(NOTE_IMAGE_MAX_BYTES);
  });

  it("rejects an oversize image with 413 and stores nothing", async () => {
    const big = new Uint8Array(NOTE_IMAGE_MAX_BYTES + 1);
    big.set(PNG_HEADER, 0);
    const response = await upload(big);
    expect(response.status).toBe(413);
    expect((await response.json()).error).toBe("NOTE_IMAGE_TOO_LARGE");
    expect(await db.noteImage.count({ where: { workspaceId: main.id } })).toBe(
      0,
    );
  });

  it("rejects an empty file with 400", async () => {
    const response = await upload(new Uint8Array(0));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("NOTE_IMAGE_INVALID");
  });

  it("rejects a request without a file field with 400", async () => {
    const response = await upload(pngBytes(), { field: "photo" });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("NOTE_IMAGE_INVALID");
  });

  it("rejects a non-multipart body with 400", async () => {
    const { POST } = await import("@/app/api/notes/images/route");
    const response = await POST(
      new NextRequest("http://localhost/api/notes/images", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Inspoter-Workspace": main.id,
        },
        body: "{}",
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("NOTE_IMAGE_INVALID");
  });

  it("does not reach the service when authentication fails", async () => {
    auth.reject = new WorkspaceContextRequiredError();
    const response = await upload(pngBytes());
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("WORKSPACE_CONTEXT_REQUIRED");
    expect(await db.noteImage.count({ where: { workspaceId: main.id } })).toBe(
      0,
    );
  });
});

describe("GET /api/notes/images/[id]", () => {
  it("serves the stored bytes with the hardened headers", async () => {
    const bytes = pngBytes();
    const { id } = await (await upload(bytes)).json();

    const response = await fetchImage(id);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Content-Length")).toBe(
      String(bytes.byteLength),
    );
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Cache-Control")).toBe(
      "private, max-age=31536000, immutable",
    );
    const served = new Uint8Array(await response.arrayBuffer());
    expect(Buffer.from(served).equals(Buffer.from(bytes))).toBe(true);
  });

  it("serves the type detected from the bytes, not the one declared", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a]);
    const { id } = await (
      await upload(jpeg, { filename: "x.png", type: "image/png" })
    ).json();

    const response = await fetchImage(id);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("returns 404 for an unknown id", async () => {
    const response = await fetchImage("nonexistent-id");
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("RESOURCE_NOT_FOUND");
  });

  it("returns 404 for an image of another workspace", async () => {
    const { id } = await (await upload(pngBytes())).json();
    auth.context = { workspace: other, operator };

    const response = await fetchImage(id);
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("RESOURCE_NOT_FOUND");
  });

  it("does not reach the service when authentication fails", async () => {
    const { id } = await (await upload(pngBytes())).json();
    auth.reject = new WorkspaceContextRequiredError();

    const response = await fetchImage(id);
    expect(response.status).toBe(400);
    expect(response.headers.get("Content-Type")).not.toBe("image/png");
  });
});
