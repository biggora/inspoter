One-liner: Centered icon-well + title + text (+ optional action) for empty, not-found, and error states.

```jsx
<EmptyState icon="ri-server-line" title="Нет серверов"
  description="В вашем аккаунте пока нет активных VPS." />

<EmptyState icon="ri-cloud-off-line" tone="primary" title="Hetzner недоступен"
  description="Не удалось получить данные о серверах."
  action={<Button icon="ri-refresh-line">Повторить</Button>} />
```

- Tone convention: `secondary` = empty list · `primary` = load error (add a retry `Button`) · `accent` = all-clear/no-alerts.
- Well is a fixed 64px rounded square; content is centered and max-width 360.
