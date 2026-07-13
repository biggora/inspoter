One-liner: Single-select group — rounded `pill` filters or `underline` page tabs.

```jsx
<SegmentedControl
  variant="pill"
  value={range}
  onChange={setRange}
  options={[{value:'1h',label:'1ч'},{value:'24h',label:'24ч'},{value:'7d',label:'7д'}]}
/>
<SegmentedControl
  variant="underline"
  value={tab}
  onChange={setTab}
  options={[
    {value:'profile',label:'Профиль',icon:'ri-user-line'},
    {value:'security',label:'Безопасность',icon:'ri-shield-check-line'},
  ]}
/>
```

- `pill`: active option gets a terracotta fill inside a rounded track — the monitoring time-range switcher.
- `underline`: active option gets a terracotta bottom border + tinted text — the Settings tab bar.
