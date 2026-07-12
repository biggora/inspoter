One-liner: Square icon-only button for topbars, toolbars, and row actions.

```jsx
<IconButton icon="ri-moon-line" aria-label="Тёмная тема" />
<IconButton icon="ri-refresh-line" size="sm" aria-label="Обновить" />
<IconButton icon="ri-more-2-line" bordered aria-label="Меню" />
```

- `size`: `sm` 28px · `md` 32px (default) · `lg` 36px.
- `bordered` gives a resting 1px border (dropdown-trigger style).
- Always provide `aria-label` — there is no visible text.
