import React from 'react';

const CSS = `
.insp-field{display:flex;flex-direction:column;gap:6px;font-family:var(--font-body);}
.insp-field__label{font-size:14px;font-weight:500;color:oklch(var(--foreground-700));}
.insp-field__hint{font-size:11px;color:oklch(var(--foreground-400));}
.insp-field__err{font-size:11px;color:oklch(var(--primary-600));}
.insp-input-wrap{position:relative;display:flex;align-items:center;}
.insp-input{width:100%;font-family:var(--font-body);font-size:14px;color:oklch(var(--foreground-900));
  background:oklch(var(--background-50));border:1px solid oklch(var(--background-300));
  border-radius:var(--radius-lg);padding:9px 14px;outline:none;
  transition:border-color var(--duration-base) var(--ease-out),box-shadow var(--duration-base) var(--ease-out);}
.insp-input::placeholder{color:oklch(var(--foreground-300));}
.insp-input:focus{border-color:oklch(var(--primary-400));box-shadow:0 0 0 1px oklch(var(--primary-400));}
.insp-input:disabled{opacity:.5;cursor:not-allowed;}
.insp-input--has-lead{padding-left:36px;}
.insp-input--has-trail{padding-right:36px;}
.insp-input--err{border-color:oklch(var(--primary-400));}
.insp-input--err:focus{box-shadow:0 0 0 1px oklch(var(--primary-400));}
.insp-input__lead{position:absolute;left:12px;color:oklch(var(--foreground-400));font-size:16px;display:flex;pointer-events:none;}
.insp-input__trail{position:absolute;right:8px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;
  color:oklch(var(--foreground-400));background:transparent;border:none;cursor:pointer;border-radius:var(--radius-md);
  transition:color var(--duration-base) var(--ease-out);}
.insp-input__trail:hover{color:oklch(var(--foreground-600));}
`;

function useCSS() {
  React.useEffect(() => {
    if (document.getElementById('insp-input-css')) return;
    const s = document.createElement('style');
    s.id = 'insp-input-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }, []);
}

/**
 * Input — single-line text field with optional label, leading icon,
 * trailing action (e.g. password reveal, clear), hint and error text.
 */
export function Input({
  label,
  leadingIcon,
  trailingIcon,
  onTrailingClick,
  hint,
  error,
  id,
  className = '',
  ...rest
}) {
  useCSS();
  const fieldId = id || React.useId();
  return (
    <div className={`insp-field ${className}`}>
      {label && <label className="insp-field__label" htmlFor={fieldId}>{label}</label>}
      <div className="insp-input-wrap">
        {leadingIcon && <i className={`${leadingIcon} insp-input__lead`}></i>}
        <input
          id={fieldId}
          className={[
            'insp-input',
            leadingIcon ? 'insp-input--has-lead' : '',
            trailingIcon ? 'insp-input--has-trail' : '',
            error ? 'insp-input--err' : '',
          ].filter(Boolean).join(' ')}
          {...rest}
        />
        {trailingIcon && (
          <button type="button" className="insp-input__trail" onClick={onTrailingClick} tabIndex={-1} aria-hidden="true">
            <i className={trailingIcon}></i>
          </button>
        )}
      </div>
      {error ? <span className="insp-field__err">{error}</span> : hint && <span className="insp-field__hint">{hint}</span>}
    </div>
  );
}
