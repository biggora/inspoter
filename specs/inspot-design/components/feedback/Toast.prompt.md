One-liner: Transient top-right notification, tinted by variant, slides in from the right.

```jsx
{note && <Toast variant="success">Профиль успешно обновлён</Toast>}
<Toast variant="error">Не удалось запустить сервер</Toast>
<Toast variant="info" fixed={false}>Скопировано в буфер обмена</Toast>
```

- `success` teal · `error` terracotta · `info` sand. Default icon per variant; override with `icon`.
- `fixed` (default) pins it top-right; set `false` to place inside your own container. Convention: auto-dismiss after ~3.5s.
