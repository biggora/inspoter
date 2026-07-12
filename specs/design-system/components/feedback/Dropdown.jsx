import React from 'react';

const CSS = `
.insp-dd{position:relative;display:inline-block;font-family:var(--font-body);}
.insp-dd__menu{position:absolute;z-index:40;min-width:180px;margin-top:4px;
  background:oklch(var(--background-50));border:1px solid oklch(var(--background-200));
  border-radius:var(--radius-lg);box-shadow:var(--shadow-menu);padding:4px;overflow:hidden;
  animation:inspot-scale-in var(--duration-fast) var(--ease-out);transform-origin:top;}
.insp-dd__menu--right{right:0;}
.insp-dd__menu--left{left:0;}
.insp-dd__item{width:100%;display:flex;align-items:center;gap:10px;text-align:left;
  padding:8px 10px;border:none;background:transparent;cursor:pointer;border-radius:var(--radius-md);
  font-size:14px;color:oklch(var(--foreground-700));white-space:nowrap;
  transition:background-color var(--duration-base) var(--ease-out),color var(--duration-base) var(--ease-out);}
.insp-dd__item:hover{background:oklch(var(--background-100));}
.insp-dd__item.is-active{background:oklch(var(--primary-50));color:oklch(var(--primary-700));}
.insp-dd__item--danger{color:oklch(var(--primary-600));}
.insp-dd__item--danger:hover{background:oklch(var(--primary-50));}
.insp-dd__item i{display:flex;align-items:center;font-size:16px;}
.insp-dd__sep{height:1px;background:oklch(var(--background-100));margin:4px 0;}
.insp-dd__label{padding:6px 10px 4px;font-size:11px;font-weight:600;text-transform:uppercase;
  letter-spacing:var(--tracking-wide);color:oklch(var(--foreground-400));}
`;

function useCSS() {
  React.useEffect(() => {
    if (document.getElementById('insp-dd-css')) return;
    const s = document.createElement('style');
    s.id = 'insp-dd-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }, []);
}

/**
 * Dropdown — anchored menu that opens under a trigger. Uncontrolled: manages
 * its own open state, closes on outside click and item selection. Compose items
 * with the exported <DropdownItem>, <DropdownSep> and <DropdownLabel>.
 */
export function Dropdown({ trigger, align = 'left', children, className = '' }) {
  useCSS();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div className={`insp-dd ${className}`} ref={ref}>
      <span onClick={() => setOpen((o) => !o)}>{trigger}</span>
      {open && (
        <div className={`insp-dd__menu insp-dd__menu--${align}`} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({ icon, active = false, danger = false, children, ...rest }) {
  useCSS();
  const cls = ['insp-dd__item', active ? 'is-active' : '', danger ? 'insp-dd__item--danger' : ''].filter(Boolean).join(' ');
  return (
    <button className={cls} {...rest}>
      {icon && <i className={icon}></i>}
      {children}
    </button>
  );
}

export function DropdownSep() {
  useCSS();
  return <div className="insp-dd__sep"></div>;
}

export function DropdownLabel({ children }) {
  useCSS();
  return <div className="insp-dd__label">{children}</div>;
}
