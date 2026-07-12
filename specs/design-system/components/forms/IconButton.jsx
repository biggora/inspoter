import React from 'react';

const CSS = `
.insp-iconbtn{display:inline-flex;align-items:center;justify-content:center;
  border:1px solid transparent;background:transparent;cursor:pointer;
  color:oklch(var(--foreground-500));border-radius:var(--radius-md);
  transition:background-color var(--duration-base) var(--ease-out),color var(--duration-base) var(--ease-out),border-color var(--duration-base) var(--ease-out);}
.insp-iconbtn:hover:not(:disabled){background:oklch(var(--background-100));color:oklch(var(--foreground-900));}
.insp-iconbtn:focus-visible{outline:none;box-shadow:0 0 0 2px oklch(var(--background-50)),0 0 0 4px var(--focus-ring);}
.insp-iconbtn:disabled{opacity:.4;cursor:not-allowed;}
.insp-iconbtn--sm{width:28px;height:28px;font-size:15px;}
.insp-iconbtn--md{width:32px;height:32px;font-size:18px;}
.insp-iconbtn--lg{width:36px;height:36px;font-size:20px;}
.insp-iconbtn--bordered{border-color:oklch(var(--background-200));}
.insp-iconbtn--bordered:hover:not(:disabled){border-color:oklch(var(--background-300));}
`;

function useCSS() {
  React.useEffect(() => {
    if (document.getElementById('insp-iconbtn-css')) return;
    const s = document.createElement('style');
    s.id = 'insp-iconbtn-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }, []);
}

/**
 * IconButton — square, icon-only control for topbars, toolbars and menus.
 */
export function IconButton({ icon, size = 'md', bordered = false, className = '', ...rest }) {
  useCSS();
  const cls = [
    'insp-iconbtn',
    `insp-iconbtn--${size}`,
    bordered ? 'insp-iconbtn--bordered' : '',
    className,
  ].filter(Boolean).join(' ');
  return (
    <button className={cls} {...rest}>
      <i className={icon}></i>
    </button>
  );
}
