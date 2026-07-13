One-liner: Thin utilisation meter for CPU/RAM/disk load and progress.

```jsx
<ProgressBar value={42} tone="primary" />
<ProgressBar value={88} auto />           {/* auto → red at ≥85 */}
<ProgressBar value={70} size="md" tone="accent" />
```

- `value` 0–100 (clamped). `size` sm 6px (default) / md 8px.
- `auto` colours by severity: green <60, amber 60–85, red ≥85 — use it for resource bars; use explicit `tone` for neutral progress.
