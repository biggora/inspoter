// Logs screen — filter bar + table with expandable detail.
const { Input, Badge, IconTile, SegmentedControl, Dropdown, DropdownItem, Button, Toast } = window.InspotDesignSystem_abeb6a;

function LogsScreen() {
  const D = window.INSPOT_DATA;
  const [q, setQ] = React.useState('');
  const [level, setLevel] = React.useState('');
  const [expanded, setExpanded] = React.useState(null);
  const [toast, setToast] = React.useState(false);
  React.useEffect(() => { if (toast) { const t = setTimeout(() => setToast(false), 2500); return () => clearTimeout(t); } }, [toast]);

  const filtered = D.logs.filter((l) =>
    (!level || l.level === level) &&
    (!q || (l.message + l.source + l.service).toLowerCase().includes(q.toLowerCase()))
  );

  const counts = {};
  filtered.forEach((l) => { counts[l.level] = (counts[l.level] || 0) + 1; });

  const th = { textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'oklch(var(--foreground-500))', background: 'oklch(var(--background-100) / .7)' };

  return (
    <div style={{ padding: 24 }}>
      {toast && <Toast variant="success">Скопировано в буфер обмена</Toast>}
      {/* Stats bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'oklch(var(--foreground-500))' }}><b style={{ color: 'oklch(var(--foreground-700))' }}>{filtered.length}</b> записей</span>
        {Object.keys(counts).map((lv) => (
          <Badge key={lv} tone={D.levels[lv].tone} size="sm">{D.levels[lv].label} {counts[lv]}</Badge>
        ))}
        <div style={{ marginLeft: 'auto' }}><Button variant="ghost" size="sm" icon="ri-refresh-line">Обновить</Button></div>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1, maxWidth: 360 }}>
          <Input leadingIcon="ri-search-line" placeholder="Поиск по сообщению, источнику…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Dropdown align="left" trigger={
          <Button variant="secondary" size="md" icon="ri-filter-3-line" iconRight="ri-arrow-down-s-line">{level ? D.levels[level].label : 'Уровень'}</Button>
        }>
          <DropdownItem active={!level} onClick={() => setLevel('')}>Все уровни</DropdownItem>
          {Object.keys(D.levels).map((lv) => (
            <DropdownItem key={lv} icon={D.levels[lv].icon} active={level === lv} onClick={() => setLevel(lv)}>{D.levels[lv].label}</DropdownItem>
          ))}
        </Dropdown>
      </div>

      {/* Table */}
      <div style={{ border: '1px solid oklch(var(--background-200))', borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={{ ...th, width: 90 }}>Время</th><th style={{ ...th, width: 100 }}>Уровень</th><th style={{ ...th, width: 130 }}>Источник</th><th style={th}>Сообщение</th><th style={{ ...th, width: 44 }}></th></tr></thead>
          <tbody>
            {filtered.map((l) => {
              const open = expanded === l.id;
              const lv = D.levels[l.level];
              return (
                <React.Fragment key={l.id}>
                  <tr style={{ borderTop: '1px solid oklch(var(--background-100))', background: open ? 'oklch(var(--background-100) / .5)' : 'transparent', cursor: 'pointer' }} onClick={() => setExpanded(open ? null : l.id)}>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'oklch(var(--foreground-500))', fontFamily: 'var(--font-mono)' }}>{l.ts}</td>
                    <td style={{ padding: '12px 16px' }}><Badge tone={lv.tone} size="sm" icon={lv.icon}>{lv.label}</Badge></td>
                    <td style={{ padding: '12px 16px', fontSize: 12, fontWeight: 500, color: 'oklch(var(--foreground-700))' }}>{l.source}<div style={{ fontSize: 10, color: 'oklch(var(--foreground-400))', textTransform: 'uppercase' }}>{l.service}</div></td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'oklch(var(--foreground-800))', maxWidth: 460, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: open ? 'normal' : 'nowrap' }}>{l.message}</td>
                    <td style={{ padding: '12px 16px', color: 'oklch(var(--foreground-400))' }}><i className={open ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'}></i></td>
                  </tr>
                  {open && (
                    <tr style={{ background: 'oklch(var(--background-100) / .4)' }}>
                      <td colSpan={5} style={{ padding: '4px 16px 16px' }}>
                        <div style={{ border: '1px solid oklch(var(--background-200))', borderRadius: 'var(--radius-lg)', background: 'oklch(var(--background-50))', padding: 12 }}>
                          <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'oklch(var(--foreground-600))', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{l.details}</pre>
                        </div>
                        <div style={{ marginTop: 10 }}>
                          <Button variant="ghost" size="sm" icon="ri-file-copy-line" onClick={(e) => { e.stopPropagation(); setToast(true); }}>Копировать</Button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

window.LogsScreen = LogsScreen;
