import React from 'react';

const CSS = `
.insp-card{background:oklch(var(--background-50));border:1px solid oklch(var(--background-200));
  border-radius:var(--radius-xl);font-family:var(--font-body);color:oklch(var(--foreground-900));}
.insp-card--pad{padding:20px;}
.insp-card--pad-sm{padding:16px;}
.insp-card--hover{transition:border-color var(--duration-base) var(--ease-out);}
.insp-card--hover:hover{border-color:oklch(var(--background-300));}
.insp-card--clickable{cursor:pointer;text-align:left;width:100%;display:block;}
.insp-card__head{display:flex;align-items:center;justify-content:space-between;
  padding:14px 20px;border-bottom:1px solid oklch(var(--background-100));}
.insp-card__head-l{display:flex;align-items:center;gap:10px;}
.insp-card__title{font-family:var(--font-heading);font-size:14px;font-weight:600;color:oklch(var(--foreground-900));}
.insp-card__body{padding:20px;}
`;

function useCSS() {
  React.useEffect(() => {
    if (document.getElementById('insp-card-css')) return;
    const s = document.createElement('style');
    s.id = 'insp-card-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }, []);
}

/**
 * Card — the surface primitive: 1px border, 12px radius, no shadow.
 * Pass `title` (with optional `icon`/`action`) to get the standard header +
 * body split; otherwise it's a padded container (`padding` controls inset).
 */
export function Card({ title, icon, action, hover = false, onClick, padding = 'md', children, className = '' }) {
  useCSS();
  const clickable = !!onClick;
  const Comp = clickable ? 'button' : 'div';

  if (title) {
    return (
      <Comp
        onClick={onClick}
        className={[
          'insp-card',
          hover || clickable ? 'insp-card--hover' : '',
          clickable ? 'insp-card--clickable' : '',
          className,
        ].filter(Boolean).join(' ')}
      >
        <div className="insp-card__head">
          <div className="insp-card__head-l">
            {icon}
            <span className="insp-card__title">{title}</span>
          </div>
          {action}
        </div>
        <div className="insp-card__body">{children}</div>
      </Comp>
    );
  }

  const padCls = padding === 'none' ? '' : padding === 'sm' ? 'insp-card--pad-sm' : 'insp-card--pad';
  return (
    <Comp
      onClick={onClick}
      className={[
        'insp-card',
        padCls,
        hover || clickable ? 'insp-card--hover' : '',
        clickable ? 'insp-card--clickable' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      {children}
    </Comp>
  );
}
