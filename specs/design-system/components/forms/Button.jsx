import React from 'react';

const CSS = `
.insp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;
  font-family:var(--font-body);font-weight:600;white-space:nowrap;cursor:pointer;
  border:1px solid transparent;border-radius:var(--radius-lg);
  transition:background-color var(--duration-base) var(--ease-out),
    border-color var(--duration-base) var(--ease-out),color var(--duration-base) var(--ease-out);
  text-decoration:none;line-height:1;}
.insp-btn:focus-visible{outline:none;box-shadow:0 0 0 2px oklch(var(--background-50)),0 0 0 4px var(--focus-ring);}
.insp-btn:disabled{opacity:.5;cursor:not-allowed;}
/* sizes */
.insp-btn--sm{height:30px;padding:0 12px;font-size:12px;}
.insp-btn--md{height:38px;padding:0 16px;font-size:14px;}
.insp-btn--lg{height:42px;padding:0 20px;font-size:14px;}
.insp-btn--block{width:100%;}
.insp-btn__i{display:flex;align-items:center;justify-content:center;font-size:1.05em;line-height:1;}
/* variants */
.insp-btn--primary{background:oklch(var(--primary-500));color:oklch(var(--background-50));}
.insp-btn--primary:hover:not(:disabled){background:oklch(var(--primary-600));}
.insp-btn--secondary{background:transparent;border-color:oklch(var(--background-200));color:oklch(var(--foreground-700));}
.insp-btn--secondary:hover:not(:disabled){background:oklch(var(--background-100));border-color:oklch(var(--background-300));}
.insp-btn--ghost{background:transparent;color:oklch(var(--foreground-600));}
.insp-btn--ghost:hover:not(:disabled){background:oklch(var(--background-100));color:oklch(var(--foreground-900));}
.insp-btn--danger{background:oklch(var(--primary-500));color:oklch(var(--background-50));}
.insp-btn--danger:hover:not(:disabled){background:oklch(var(--primary-600));}
@keyframes spin{to{transform:rotate(360deg);}}
`;

function useCSS() {
  React.useEffect(() => {
    if (document.getElementById('insp-btn-css')) return;
    const s = document.createElement('style');
    s.id = 'insp-btn-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }, []);
}

/**
 * Button — Inspot's primary action control.
 * variants: primary (terracotta fill) · secondary (outline) · ghost · danger
 * sizes: sm · md · lg
 */
export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  block = false,
  loading = false,
  disabled = false,
  children,
  className = '',
  ...rest
}) {
  useCSS();
  const cls = [
    'insp-btn',
    `insp-btn--${variant}`,
    `insp-btn--${size}`,
    block ? 'insp-btn--block' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading ? (
        <i className="ri-loader-4-line insp-btn__i" style={{ animation: 'spin 0.7s linear infinite' }}></i>
      ) : (
        icon && <i className={`${icon} insp-btn__i`}></i>
      )}
      {children && <span>{children}</span>}
      {iconRight && !loading && <i className={`${iconRight} insp-btn__i`}></i>}
    </button>
  );
}
