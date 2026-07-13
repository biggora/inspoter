One-liner: Dashboard KPI tile — tinted icon, uppercase label, one big number, optional legend/progress slot.

```jsx
<StatCard icon="ri-server-line" label="Серверы" value={4} sub={6} subtitle="в сети" tone="accent"
  onClick={() => go('/servers')}>
  <span style={{fontSize:11}}>4 online · 2 off</span>
</StatCard>

<StatCard icon="ri-cpu-line" label="CPU (сред.)" value="42%" tone="primary">
  <ProgressBar value={42} tone="primary" />
</StatCard>
```

- `sub` renders a muted `/N` denominator after the value. `tone` colours the icon tile.
- `onClick` turns the whole tile into a nav button (hover raises the border). `children` holds the dot legend or a `<ProgressBar>`.
