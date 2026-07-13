import React from "react";

const CSS = `
.insp-switch{position:relative;display:inline-flex;align-items:center;flex-shrink:0;
  height:24px;width:44px;border-radius:var(--radius-full);border:none;cursor:pointer;padding:0;
  background:oklch(var(--background-300));
  transition:background-color var(--duration-base) var(--ease-out);}
.insp-switch--on{background:oklch(var(--accent-500));}
.insp-switch:focus-visible{outline:none;box-shadow:0 0 0 2px oklch(var(--background-50)),0 0 0 4px var(--focus-ring);}
.insp-switch:disabled{opacity:.5;cursor:not-allowed;}
.insp-switch__knob{position:absolute;top:4px;left:4px;height:16px;width:16px;border-radius:var(--radius-full);
  background:oklch(var(--background-50));transition:transform var(--duration-base) var(--ease-out);}
.insp-switch--on .insp-switch__knob{transform:translateX(20px);}
.insp-switch-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;font-family:var(--font-body);}
.insp-switch-row__t{font-size:14px;font-weight:500;color:oklch(var(--foreground-800));}
.insp-switch-row__d{font-size:12px;color:oklch(var(--foreground-400));margin-top:2px;}
`;

function useCSS() {
  React.useEffect(() => {
    if (document.getElementById("insp-switch-css")) return;
    const s = document.createElement("style");
    s.id = "insp-switch-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }, []);
}

/**
 * Switch — the on/off toggle used throughout Settings. "On" is teal (accent).
 * Pass `label`/`description` to render the full settings row; omit them for a
 * bare switch.
 */
export function Switch({
  checked = false,
  onChange,
  disabled = false,
  label,
  description,
  className = "",
  ...rest
}) {
  useCSS();
  const toggle = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={typeof label === "string" ? label : undefined}
      disabled={disabled}
      onClick={() => onChange && onChange(!checked)}
      className={`insp-switch ${checked ? "insp-switch--on" : ""}`}
      {...rest}
    >
      <span className="insp-switch__knob"></span>
    </button>
  );

  if (!label && !description)
    return React.cloneElement(toggle, {
      className: `insp-switch ${checked ? "insp-switch--on" : ""} ${className}`,
    });

  return (
    <div className={`insp-switch-row ${className}`}>
      <div>
        <p className="insp-switch-row__t">{label}</p>
        {description && <p className="insp-switch-row__d">{description}</p>}
      </div>
      {toggle}
    </div>
  );
}
