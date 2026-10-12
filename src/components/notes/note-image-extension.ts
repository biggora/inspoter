import Image from "@tiptap/extension-image";
import { mergeAttributes } from "@tiptap/react";

import { isNoteImageUrl } from "@/lib/notes/images";

// Block-level image node for note content. Only the relative note-image URL may
// become an <img>; any other source (external, data:, protocol-relative…)
// renders as a text placeholder so the browser never requests it. The node and
// its src stay in the document, so foreign image Markdown round-trips as is.
export const NoteImage = Image.configure({
  inline: false,
  allowBase64: false,
}).extend({
  renderHTML({ HTMLAttributes }) {
    const src: unknown = HTMLAttributes.src;
    if (typeof src === "string" && isNoteImageUrl(src)) {
      return [
        "img",
        mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      ];
    }

    const alt: unknown = HTMLAttributes.alt;
    const label =
      typeof alt === "string" && alt.trim()
        ? alt
        : typeof src === "string"
          ? src
          : "";
    return [
      "span",
      {
        class:
          "block w-fit max-w-full break-all rounded-md border border-dashed border-[var(--border-default)] px-2 py-1 text-xs text-foreground-400",
        "data-note-image-blocked": "",
      },
      label,
    ];
  },
});
