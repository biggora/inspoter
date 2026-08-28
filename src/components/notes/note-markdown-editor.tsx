"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { Markdown } from "@tiptap/markdown";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface NoteMarkdownEditorLabels {
  toolbar: string;
  blockType: string;
  paragraph: string;
  heading: (level: number) => string;
  bold: string;
  italic: string;
  strike: string;
  code: string;
  bulletList: string;
  orderedList: string;
  blockquote: string;
  codeBlock: string;
  horizontalRule: string;
  link: string;
  linkUrl: string;
  applyLink: string;
  removeLink: string;
  undo: string;
  redo: string;
}

interface NoteMarkdownEditorProps {
  id: string;
  labelledBy: string;
  initialMarkdown: string;
  labels: NoteMarkdownEditorLabels;
  onChange: (markdown: string) => void;
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

export function NoteMarkdownEditor({
  id,
  labelledBy,
  initialMarkdown,
  labels,
  onChange,
}: NoteMarkdownEditorProps) {
  const onChangeRef = useRef(onChange);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: {
          autolink: true,
          linkOnPaste: true,
          openOnClick: false,
          HTMLAttributes: {
            rel: "noopener noreferrer",
          },
        },
      }),
      Markdown,
    ],
    content: initialMarkdown,
    contentType: "markdown",
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelledBy,
        class:
          "min-h-full px-4 py-3 text-sm leading-6 text-foreground-900 outline-none",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChangeRef.current(currentEditor.getMarkdown());
    },
  });

  if (!editor) {
    return (
      <div className="min-h-72 flex-1 animate-pulse rounded-lg border border-[var(--border-default)] bg-[var(--surface-sunken)]" />
    );
  }

  const activeEditor = editor;
  const headingValue = [1, 2, 3, 4, 5, 6].find((level) =>
    activeEditor.isActive("heading", { level }),
  );
  const blockType = headingValue ? `heading-${headingValue}` : "paragraph";
  const blockTypeItems = {
    paragraph: labels.paragraph,
    ...Object.fromEntries(
      [1, 2, 3, 4, 5, 6].map((level) => [
        `heading-${level}`,
        labels.heading(level),
      ]),
    ),
  };

  function setBlockType(value: string | null) {
    if (!value) return;
    if (value === "paragraph") {
      activeEditor.chain().focus().setParagraph().run();
      return;
    }
    const level = Number(value.replace("heading-", ""));
    if (level >= 1 && level <= 6) {
      activeEditor
        .chain()
        .focus()
        .toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 })
        .run();
    }
  }

  function applyLink() {
    const href = normalizeLink(linkUrl);
    if (!href) return;
    activeEditor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href })
      .run();
    setLinkOpen(false);
  }

  function openLinkEditor() {
    setLinkUrl(activeEditor.getAttributes("link").href ?? "");
    setLinkOpen(true);
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] focus-within:border-[var(--focus-ring)] focus-within:outline-2 focus-within:outline-[var(--focus-ring)]">
      <div
        role="toolbar"
        aria-label={labels.toolbar}
        className="flex min-h-10 flex-wrap items-center gap-0.5 border-b border-[var(--border-default)] bg-[var(--surface-sunken)] px-1.5 py-1"
      >
        <Select
          value={blockType}
          onValueChange={setBlockType}
          items={blockTypeItems}
        >
          <SelectTrigger
            size="sm"
            aria-label={labels.blockType}
            className="min-w-28"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {Object.entries(blockTypeItems).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Separator orientation="vertical" className="mx-1 h-5" />
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
          label={labels.strike}
          icon="ri-strikethrough"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
        <ToolbarButton
          label={labels.code}
          icon="ri-code-line"
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
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
        <ToolbarButton
          label={labels.codeBlock}
          icon="ri-terminal-box-line"
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        />
        <ToolbarButton
          label={labels.horizontalRule}
          icon="ri-separator"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
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
        className="min-h-0 flex-1 overflow-y-auto [&_.ProseMirror]:min-h-full [&_.ProseMirror_a]:text-primary [&_.ProseMirror_a]:underline [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-[var(--border-strong)] [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_code]:rounded-sm [&_.ProseMirror_code]:bg-[var(--surface-sunken)] [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:font-mono [&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h1]:font-semibold [&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h3]:text-lg [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h4]:text-base [&_.ProseMirror_h4]:font-semibold [&_.ProseMirror_h5]:text-sm [&_.ProseMirror_h5]:font-semibold [&_.ProseMirror_h6]:text-sm [&_.ProseMirror_h6]:font-semibold [&_.ProseMirror_hr]:my-4 [&_.ProseMirror_hr]:border-[var(--border-default)] [&_.ProseMirror_li]:my-1 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6 [&_.ProseMirror_p]:my-2 [&_.ProseMirror_p:first-child]:mt-0 [&_.ProseMirror_p:last-child]:mb-0 [&_.ProseMirror_pre]:my-3 [&_.ProseMirror_pre]:overflow-x-auto [&_.ProseMirror_pre]:rounded-md [&_.ProseMirror_pre]:bg-[var(--surface-sunken)] [&_.ProseMirror_pre]:p-3 [&_.ProseMirror_pre]:font-mono [&_.ProseMirror_pre]:text-xs [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6"
      />
    </div>
  );
}
