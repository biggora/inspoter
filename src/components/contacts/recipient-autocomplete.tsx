"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { contactsApi } from "./api";
import type { RecipientSuggestion } from "@/lib/services/contacts";

// Address-book autocomplete for the mail composer's To/Cc/Bcc fields. The
// field holds a comma-separated list, so only the fragment after the last
// comma is treated as the query and only that fragment is replaced on pick —
// the addresses already entered are never touched.

const DEBOUNCE_MS = 200;
const MIN_QUERY_LENGTH = 2;

function currentFragment(
  value: string,
  caret: number,
): { start: number; text: string } {
  const upToCaret = value.slice(0, caret);
  const start = upToCaret.lastIndexOf(",") + 1;
  return { start, text: value.slice(start, caret).trim() };
}

function formatRecipient(suggestion: RecipientSuggestion): string {
  const name = suggestion.displayName.trim();
  // A name with a comma in it would split the field, so it is quoted the way
  // RFC 5322 display names are.
  if (name.length === 0 || name === suggestion.email) return suggestion.email;
  const safeName = /[,;<>"]/u.test(name)
    ? `"${name.replace(/"/gu, "")}"`
    : name;
  return `${safeName} <${suggestion.email}>`;
}

export interface RecipientAutocompleteProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

export function RecipientAutocomplete({
  id,
  value,
  onChange,
  placeholder,
  autoFocus,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: RecipientAutocompleteProps) {
  const t = useTranslations("contacts");
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<RecipientSuggestion[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const [open, setOpen] = useState(false);

  // Fetch only. Clearing a stale list is the job of the handler that shortened
  // the query, so this effect never sets state synchronously.
  useEffect(() => {
    if (query.length < MIN_QUERY_LENGTH) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      contactsApi
        .suggest(query)
        .then((result) => {
          if (cancelled) return;
          setSuggestions(result.suggestions);
          setHighlighted(0);
        })
        // A failing lookup must never block typing an address by hand.
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  function refreshQuery(next: string, caret: number): void {
    const fragment = currentFragment(next, caret);
    const searchable = fragment.text.length >= MIN_QUERY_LENGTH;
    setQuery(fragment.text);
    setOpen(searchable);
    // Matches for a query the operator has backspaced away must not linger.
    if (!searchable) setSuggestions([]);
  }

  function pick(suggestion: RecipientSuggestion): void {
    const input = inputRef.current;
    const caret = input?.selectionStart ?? value.length;
    const fragment = currentFragment(value, caret);
    const before = value.slice(0, fragment.start);
    const after = value.slice(caret);
    const separator =
      before.trim().length > 0 && !before.endsWith(" ") ? " " : "";
    const next = `${before}${separator}${formatRecipient(suggestion)}, ${after.trimStart()}`;
    onChange(next);
    setOpen(false);
    setQuery("");
    setSuggestions([]);
    requestAnimationFrame(() => input?.focus());
  }

  const visible = open && suggestions.length > 0;

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={id}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          refreshQuery(event.target.value, event.target.selectionStart ?? 0);
        }}
        onBlur={() => {
          // Deferred so a click on an option lands before the list unmounts.
          setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={(event) => {
          if (!visible) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlighted((current) => (current + 1) % suggestions.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlighted(
              (current) =>
                (current - 1 + suggestions.length) % suggestions.length,
            );
          } else if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            pick(suggestions[highlighted]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
        role="combobox"
        aria-expanded={visible}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={visible ? `${listId}-${highlighted}` : undefined}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
      />
      {visible && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t("recipientSuggestionsLabel")}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-background-200 bg-background py-1 shadow-md"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={`${suggestion.contactId}-${suggestion.email}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === highlighted}
              onMouseDown={(event) => {
                // mousedown, not click: blur would close the list first.
                event.preventDefault();
                pick(suggestion);
              }}
              onMouseEnter={() => setHighlighted(index)}
              className={cn(
                "cursor-pointer px-3 py-1.5 text-sm",
                index === highlighted && "bg-background-100",
              )}
            >
              <span className="block truncate font-medium">
                {suggestion.displayName || suggestion.email}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {suggestion.email}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
