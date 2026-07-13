One-liner: Inspot's action button — filled terracotta `primary`, outline `secondary`, `ghost`, and `danger`, in three heights.

```jsx
<Button variant="primary" icon="ri-add-line">Создать</Button>
<Button variant="secondary" size="sm">Отмена</Button>
<Button variant="ghost" icon="ri-refresh-line">Обновить</Button>
<Button variant="primary" loading>Сохранение…</Button>
```

- `variant`: `primary` (one per view) · `secondary` (outline) · `ghost` (toolbar/inline) · `danger` (alias of primary — same terracotta, used for destructive confirms).
- `size`: `sm` (30px, filter chips), `md` (38px, default), `lg` (42px, CTA).
- `icon` / `iconRight` take Remix Icon classes. `loading` swaps the leading icon for a spinner and disables.
- `block` stretches to full width (login CTA pattern).
