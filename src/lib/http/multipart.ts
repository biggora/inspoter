import Busboy from "busboy";

export class MultipartTooLargeError extends Error {
  constructor() {
    super("Multipart request exceeds its configured limit");
    this.name = "MultipartTooLargeError";
  }
}

export class MultipartInvalidError extends Error {
  constructor() {
    super("Invalid multipart request");
    this.name = "MultipartInvalidError";
  }
}

export interface MultipartFile {
  fieldName: string;
  filename: string;
  contentType: string;
  data: Buffer;
}

export interface MultipartResult {
  fields: Map<string, string>;
  files: MultipartFile[];
}

export async function readMultipart(
  request: Request,
  options: {
    maxBodyBytes: number;
    maxFileBytes: number;
    maxFiles?: number;
    maxFields?: number;
    maxParts?: number;
  },
): Promise<MultipartResult> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new MultipartInvalidError();
  }
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > options.maxBodyBytes) {
    throw new MultipartTooLargeError();
  }

  const fields = new Map<string, string>();
  const files: MultipartFile[] = [];
  let fileCount = 0;
  let limited = false;
  let parser: ReturnType<typeof Busboy>;
  try {
    parser = Busboy({
      headers: { "content-type": contentType },
      limits: {
        fileSize: options.maxFileBytes,
        files: (options.maxFiles ?? 1) + 1,
        fields: (options.maxFields ?? 10) + 1,
        parts: (options.maxParts ?? 12) + 1,
        fieldSize: options.maxBodyBytes,
      },
    });
  } catch {
    throw new MultipartInvalidError();
  }

  const finished = new Promise<void>((resolve, reject) => {
    parser.on("field", (name, value) => {
      if (fields.size >= (options.maxFields ?? 10) && !fields.has(name)) {
        limited = true;
      }
      fields.set(name, value);
    });
    parser.on("file", (fieldName, stream, info) => {
      fileCount += 1;
      if (fileCount > (options.maxFiles ?? 1)) limited = true;
      const chunks: Buffer[] = [];
      stream.on("limit", () => {
        limited = true;
      });
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => {
        files.push({
          fieldName,
          filename: info.filename,
          contentType: info.mimeType,
          data: Buffer.concat(chunks),
        });
      });
    });
    parser.on("filesLimit", () => {
      limited = true;
    });
    parser.on("fieldsLimit", () => {
      limited = true;
    });
    parser.on("partsLimit", () => {
      limited = true;
    });
    parser.on("error", reject);
    parser.on("close", resolve);
  });

  const reader = request.body?.getReader();
  let total = 0;
  try {
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > options.maxBodyBytes) {
          limited = true;
          await reader.cancel().catch(() => {});
          parser.destroy();
          break;
        }
        parser.write(Buffer.from(value));
      }
    }
    if (!parser.destroyed) parser.end();
    await finished;
  } catch {
    if (limited) throw new MultipartTooLargeError();
    throw new MultipartInvalidError();
  }
  if (limited) throw new MultipartTooLargeError();
  return { fields, files };
}
