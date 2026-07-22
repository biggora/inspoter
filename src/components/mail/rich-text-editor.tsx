"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface RichTextValue {
  html: string;
  text: string;
  isEmpty: boolean;
}

interface RichTextEditorLabels {
  toolbar: string;
  bold: string;
  italic: string;
  underline: string;
  bulletList: string;
  orderedList: string;
  blockquote: string;
  link: string;
  linkUrl: string;
  applyLink: string;
  removeLink: string;
  clearFormatting: string;
  undo: string;
  redo: string;
}

interface RichTextEditorProps {
  id: string;
  labels: RichTextEditorLabels;
  onChange: (value: RichTextValue) => void;
  onSubmitShortcut: () => void;
  labelledBy: string;
  initialHtml?: string;
  autoFocus?: boolean;
  invalid?: boolean;
  describedBy?: string;
  compact?: boolean;
}

interface ToolbarButtonProps {
  label: string;
  icon: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function ToolbarButton({
  label,
  icon,
  active,
  disabled,
  onClick,
}: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(active && "bg-[var(--surface-hover)] text-foreground-900")}
    >
      <Icon name={icon} aria-hidden />
    </Button>
  );
}

function normalizeLink(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || /^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function RichTextEditor({
  id,
  labels,
  onChange,
  onSubmitShortcut,
  labelledBy,
  initialHtml = "<p></p>",
  autoFocus = false,
  invalid = false,
  describedBy,
  compact = false,
}: RichTextEditorProps) {
  const submitShortcutRef = useRef(onSubmitShortcut);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  useEffect(() => {
    submitShortcutRef.current = onSubmitShortcut;
  }, [onSubmitShortcut]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        link: {
          autolink: true,
          linkOnPaste: true,
          openOnClick: false,
          HTMLAttributes: {
            rel: "noopener noreferrer",
          },
        },
      }),
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelledBy,
        ...(invalid ? { "aria-invalid": "true" } : {}),
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        class:
          "min-h-full px-4 py-3 text-sm leading-6 text-foreground-900 outline-none",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          submitShortcutRef.current();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange({
        html: currentEditor.getHTML(),
        text: currentEditor.getText({ blockSeparator: "\n" }),
        isEmpty: currentEditor.isEmpty,
      });
    },
  });

  useEffect(() => {
    if (!autoFocus || !editor) return;
    const frame = requestAnimationFrame(() => editor.commands.focus("end"));
    return () => cancelAnimationFrame(frame);
  }, [autoFocus, editor]);

  if (!editor) {
    return (
      <div
        className={cn(
          "animate-pulse bg-[var(--surface-sunken)]",
          compact ? "min-h-36" : "min-h-72",
        )}
      />
    );
  }

  function applyLink() {
    const href = normalizeLink(linkUrl);
    if (!href) return;
    editor?.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkOpen(false);
  }

  function openLinkEditor() {
    setLinkUrl(editor?.getAttributes("link").href ?? "");
    setLinkOpen(true);
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-[var(--surface-card)] focus-within:border-[var(--focus-ring)] focus-within:outline-2 focus-within:outline-[var(--focus-ring)]",
        invalid ? "border-destructive" : "border-[var(--border-default)]",
      )}
    >
      <div
        role="toolbar"
        aria-label={labels.toolbar}
        className="flex min-h-10 flex-wrap items-center gap-0.5 border-b border-[var(--border-default)] bg-[var(--surface-sunken)] px-1.5 py-1"
      >
        <ToolbarButton
          label={labels.bold}
          icon="ri-bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          label={labels.italic}
          icon="ri-italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          label={labels.underline}
          icon="ri-underline"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <ToolbarButton
          label={labels.bulletList}
          icon="ri-list-unordered"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          label={labels.orderedList}
          icon="ri-list-ordered-2"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          label={labels.blockquote}
          icon="ri-double-quotes-l"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />
        <Popover open={linkOpen} onOpenChange={setLinkOpen}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={labels.link}
                title={labels.link}
                aria-pressed={editor.isActive("link") || undefined}
                onClick={openLinkEditor}
              />
            }
          >
            <Icon name="ri-link" aria-hidden />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80">
            <FieldLabel htmlFor={`${id}-link`} className="text-xs font-medium">
              {labels.linkUrl}
            </FieldLabel>
            <div className="flex gap-2">
              <Input
                id={`${id}-link`}
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applyLink();
                  }
                }}
                placeholder="https://example.com"
                autoFocus
              />
              <Button type="button" size="sm" onClick={applyLink}>
                {labels.applyLink}
              </Button>
            </div>
            {editor.isActive("link") && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => {
                  editor.chain().focus().unsetLink().run();
                  setLinkOpen(false);
                }}
              >
                {labels.removeLink}
              </Button>
            )}
          </PopoverContent>
        </Popover>
        <ToolbarButton
          label={labels.clearFormatting}
          icon="ri-format-clear"
          onClick={() =>
            editor.chain().focus().unsetAllMarks().clearNodes().run()
          }
        />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <ToolbarButton
          label={labels.undo}
          icon="ri-arrow-go-back-line"
          disabled={!editor.can().chain().focus().undo().run()}
          onClick={() => editor.chain().focus().undo().run()}
        />
        <ToolbarButton
          label={labels.redo}
          icon="ri-arrow-go-forward-line"
          disabled={!editor.can().chain().focus().redo().run()}
          onClick={() => editor.chain().focus().redo().run()}
        />
      </div>
      <EditorContent
        editor={editor}
        className={cn(
          "overflow-y-auto [&_.ProseMirror]:min-h-[inherit] [&_.ProseMirror_a]:text-primary [&_.ProseMirror_a]:underline [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-[var(--border-strong)] [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_li]:my-1 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6 [&_.ProseMirror_p]:my-2 [&_.ProseMirror_p:first-child]:mt-0 [&_.ProseMirror_p:last-child]:mb-0 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6",
          compact ? "min-h-36 max-h-80" : "min-h-72 flex-1",
        )}
      />
    </div>
  );
}
