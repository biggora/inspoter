One-liner: Single-line text field with label, optional leading icon, trailing action, hint/error.

```jsx
<Input label="Имя пользователя" placeholder="admin" />
<Input label="Пароль" type="password" trailingIcon="ri-eye-line" onTrailingClick={reveal} />
<Input leadingIcon="ri-search-line" placeholder="Поиск по логам…" />
<Input label="Email" error="Неверный формат" defaultValue="bad@" />
```

- `leadingIcon` / `trailingIcon` are Remix Icon classes; `onTrailingClick` wires the trailing button (password reveal, clear).
- `error` shows red helper text and recolors the border; `hint` is the muted fallback.
- Focus = 1px terracotta ring. All native `<input>` props pass through.
