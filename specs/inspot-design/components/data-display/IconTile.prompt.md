One-liner: The tinted rounded icon square that prefixes headers, rows and cards everywhere in Inspot.

```jsx
<IconTile icon="ri-server-line" tone="accent" />
<IconTile icon="ri-global-line" tone="secondary" size="sm" />
<IconTile icon="ri-alert-line" tone="amber" size="lg" />
<IconTile icon="ri-cloud-off-line" tone="primary" size="xl" />
```

- `size`: `sm` 28 (list rows) · `md` 32 (widget headers — default) · `lg` 36 (card headers) · `xl` 64 (empty-state well).
- Tone tints the fill + icon together. Default `secondary` (sand) reads as neutral.
