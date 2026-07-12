import React from 'react';

const CSS = `
.insp-tile{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;}
.insp-tile--sm{width:28px;height:28px;border-radius:var(--radius-md);font-size:13px;}
.insp-tile--md{width:32px;height:32px;border-radius:var(--radius-lg);font-size:15px;}
.insp-tile--lg{width:36px;height:36px;border-radius:var(--radius-lg);font-size:18px;}
.insp-tile--xl{width:64px;height:64px;border-radius:var(--radius-2xl);font-size:26px;}
.insp-tile--primary{background:oklch(var(--primary-100));color:oklch(var(--primary-600));}
.insp-tile--accent{background:oklch(var(--accent-100));color:oklch(var(--accent-600));}
.insp-tile--secondary{background:oklch(var(--secondary-100));color:oklch(var(--secondary-600));}
.insp-tile--amber{background:oklch(var(--amber-500) / .18);color:oklch(var(--amber-700));}
.insp-tile--red{background:oklch(var(--red-500) / .16);color:oklch(var(--red-600));}
.insp-tile--neutral{background:oklch(var(--background-100));color:oklch(var(--foreground-500));}
`;

function useCSS() {
  React.useEffect(() => {
    if (document.getElementById('insp-tile-css')) return;
    const s = document.createElement('style');
    s.id = 'insp-tile-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }, []);
}

/**
 * IconTile — the rounded tinted square that carries an icon. Inspot's most
 * repeated motif: it prefixes widget headers, list rows, stat cards and
 * empty states. `xl` is the empty-state well.
 */
export function IconTile({ icon, tone = 'secondary', size = 'md', className = '' }) {
  useCSS();
  return (
    <span className={`insp-tile insp-tile--${tone} insp-tile--${size} ${className}`}>
      <i className={icon}></i>
    </span>
  );
}
