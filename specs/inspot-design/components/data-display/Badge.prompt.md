One-liner: Status pill with optional status dot or icon, in six semantic tones.

```jsx
<Badge tone="accent" dot>Онлайн</Badge>
<Badge tone="amber" dot>Деградация</Badge>
<Badge tone="red" dot pulse>Офлайн</Badge>
<Badge tone="secondary" dot>Остановлен</Badge>
<Badge tone="red" size="sm" icon="ri-error-warning-line">ERROR</Badge>
```

- Tone map: `accent` online/ok · `amber` warning · `red` danger/error · `primary` brand · `secondary` idle/stopped · `neutral` default.
- `dot` renders the 6px leading dot; `pulse` animates it (transitional states like "Starting…"). `icon` replaces the dot with a glyph (log-level badges).
