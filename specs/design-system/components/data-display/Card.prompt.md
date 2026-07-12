One-liner: The border-defined surface — plain padded container, or header+body widget panel.

```jsx
{/* plain container */}
<Card>…</Card>
<Card padding="sm" hover>…</Card>

{/* dashboard widget with header */}
<Card
  title="Состояние серверов"
  icon={<IconTile icon="ri-server-line" tone="secondary" />}
  action={<a href="#">Все серверы →</a>}
>
  <table>…</table>
</Card>
```

- Flat by design: 1px `background-200` border, 12px radius, **no shadow**. `hover` lightens the border; `onClick` makes the whole card a button.
- With `title`, body padding is fixed at 20px. Without it, `padding` = none/sm(16)/md(20).
