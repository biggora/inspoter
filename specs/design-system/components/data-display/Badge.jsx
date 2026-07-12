import React from 'react';

const CSS = `
.insp-badge{display:inline-flex;align-items:center;gap:6px;font-family:var(--font-body);
  font-weight:500;white-space:nowrap;border-radius:var(--radius-full);line-height:1;}
.insp-badge--sm{font-size:10px;padding:2px 8px;}
.insp-badge--md{font-size:12px;padding:4px 10px;}
.insp-badge__dot{width:6px;height:6px;border-radius:var(--radius-full);flex-shrink:0;}
.insp-badge__i{display:flex;align-items:center;font-size:1em;}
.insp-badge--pulse .insp-badge__dot{animation:insp-badge-pulse 1.4s ease-in-out infinite;}
@keyframes insp-badge-pulse{0%,100%{opacity:1;}50%{opacity:.35;}}
/* tones: bg tint + text */
.insp-badge--accent{background:oklch(var(--accent-100));color:oklch(var(--accent-700));}
.insp-badge--accent .insp-badge__dot{background:oklch(var(--accent-500));}
.insp-badge--primary{background:oklch(var(--primary-100));color:oklch(var(--primary-700));}
.insp-badge--primary .insp-badge__dot{background:oklch(var(--primary-500));}
.insp-badge--amber{background:oklch(var(--amber-500) / .18);color:oklch(var(--amber-700));}
.insp-badge--amber .insp-badge__dot{background:oklch(var(--amber-500));}
.insp-badge--red{background:oklch(var(--red-500) / .16);color:oklch(var(--red-700));}
.insp-badge--red .insp-badge__dot{background:oklch(var(--red-500));}
.insp-badge--secondary{background:oklch(var(--secondary-100));color:oklch(var(--secondary-700));}
.insp-badge--secondary .insp-badge__dot{background:oklch(var(--secondary-400));}
.insp-badge--neutral{background:oklch(var(--background-200));color:oklch(var(--foreground-500));}
.insp-badge--neutral .insp-badge__dot{background:oklch(var(--foreground-300));}
`;

function useCSS() {
  React.useEffect(() => {
    if (document.getElementById('insp-badge-css')) return;
    const s = document.createElement('style');
    s.id = 'insp-badge-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }, []);
}

/**
 * Badge — status pill. Optional leading status dot or icon.
 * tones: accent (ok/online) · amber (warn) · red (danger) · primary · secondary (idle) · neutral
 */
export function Badge({ tone = 'neutral', size = 'md', dot = false, pulse = false, icon, children, className = '' }) {
  useCSS();
  const cls = [
    'insp-badge',
    `insp-badge--${tone}`,
    `insp-badge--${size}`,
    pulse ? 'insp-badge--pulse' : '',
    className,
  ].filter(Boolean).join(' ');
  return (
    <span className={cls}>
      {dot && <span className="insp-badge__dot"></span>}
      {icon && <i className={`${icon} insp-badge__i`}></i>}
      {children}
    </span>
  );
}
