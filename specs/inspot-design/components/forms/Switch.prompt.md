One-liner: 44×24 toggle switch (teal when on); optionally renders a full Settings row.

```jsx
<Switch checked={on} onChange={setOn} />
<Switch
  label="Компактный режим"
  description="Уменьшенные отступы и размеры элементов"
  checked={compact}
  onChange={setCompact}
/>
```

- Bare toggle when `label`/`description` are omitted; otherwise the text sits left, switch right — the exact Settings pattern.
- On = accent teal, off = background-300 track. Knob is 16px.
