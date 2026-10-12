import { NodeSelection, Selection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";

import {
  isNoteImageUrl,
  NOTE_IMAGE_CONTENT_TYPES,
  NOTE_IMAGE_MAX_BYTES,
} from "@/lib/notes/images";
import { ApiError, notesApi } from "./api";

export type NoteImageFailure = "unsupportedType" | "tooLarge" | "uploadFailed";

const ALLOWED_TYPES: readonly string[] = NOTE_IMAGE_CONTENT_TYPES;

/** Image files (by declared type) from a clipboard or drag-and-drop list. */
export function imageFilesFrom(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter((file) =>
    file.type.startsWith("image/"),
  );
}

/**
 * Whether the clipboard carries text a normal paste would insert: non-blank
 * plain text, or HTML with visible text. Copying from Word, Excel or a web page
 * puts such text next to an image preview, and that text must not be dropped.
 * A bare screenshot, or "copy image" (HTML that is only an <img>), has none.
 */
export function clipboardHasText(data: DataTransfer | null): boolean {
  if (!data) return false;
  if (data.getData("text/plain").trim()) return true;
  const html = data.getData("text/html");
  return html.replace(/<[^>]*>/g, "").trim() !== "";
}

/**
 * Markdown to store for the editor: the block serializer ends an image (or a
 * trailing empty paragraph) with blank lines, which would otherwise be saved.
 */
export function noteMarkdown(editor: Editor): string {
  return editor.getMarkdown().replace(/\n+$/, "");
}

/** Client-side pre-check; the server re-validates the actual bytes. */
export function checkNoteImageFile(file: File): NoteImageFailure | null {
  if (!ALLOWED_TYPES.includes(file.type)) return "unsupportedType";
  if (file.size > NOTE_IMAGE_MAX_BYTES) return "tooLarge";
  return null;
}

/** File name without its extension, safe inside `![alt](…)`. */
export function noteImageAlt(fileName: string): string {
  return fileName
    .replace(/\.[^.]*$/, "")
    .replace(/[[\]\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function failureFor(error: unknown): NoteImageFailure {
  if (error instanceof ApiError) {
    if (error.code === "NOTE_IMAGE_TOO_LARGE") return "tooLarge";
    if (error.code === "NOTE_IMAGE_UNSUPPORTED_TYPE") return "unsupportedType";
  }
  return "uploadFailed";
}

/**
 * Validates, uploads and inserts image files one after another. Failures are
 * reported per file through `onFailure` and never stop the remaining files.
 * `position` (drop target) applies to the first inserted image; later images
 * and calls without it go to the current selection. Does not lock the editor:
 * it can be edited while uploads are in flight.
 */
export async function insertNoteImages(
  editor: Editor,
  files: File[],
  onFailure: (failure: NoteImageFailure) => void,
  position?: number,
): Promise<void> {
  let at = position;
  for (const file of files) {
    const invalid = checkNoteImageFile(file);
    if (invalid) {
      onFailure(invalid);
      continue;
    }

    let url: string;
    try {
      ({ url } = await notesApi.uploadImage(file));
    } catch (error) {
      onFailure(failureFor(error));
      continue;
    }
    if (!isNoteImageUrl(url)) {
      onFailure("uploadFailed");
      continue;
    }
    if (editor.isDestroyed) return;

    const node = {
      type: "image",
      attrs: { src: url, alt: noteImageAlt(file.name) },
    };
    const chain = editor.chain();
    if (at === undefined) {
      chain.insertContent(node);
    } else {
      chain.insertContentAt(Math.min(at, editor.state.doc.content.size), node);
    }
    chain.run();
    at = undefined;

    // An image inserted as the last block is left node-selected, so typing or
    // the next image would replace it. Move the caret into the paragraph
    // StarterKit keeps after a trailing block (its trailing node) — no
    // paragraph is added here, a second empty one would be saved as "&nbsp;".
    const { selection, doc, tr } = editor.state;
    if (selection instanceof NodeSelection) {
      const after = Selection.near(doc.resolve(selection.to), 1);
      editor.view.dispatch(tr.setSelection(after));
    }
  }
}
