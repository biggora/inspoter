import React from "react";

const CSS = `
.insp-seg{display:inline-flex;align-items:center;gap:4px;padding:4px;font-family:var(--font-body);}
.insp-seg--pill{border:1px solid oklch(var(--background-200));border-radius:var(--radius-full);background:oklch(var(--background-50));}
.insp-seg--underline{gap:0;padding:0;border-bottom:1px solid oklch(var(--background-200));}
.insp-seg__opt{display:inline-flex;align-items:center;gap:6px;border:none;background:transparent;cursor:pointer;
  font-size:12px;font-weight:500;white-space:nowrap;color:oklch(var(--foreground-500));
  transition:background-color var(--duration-base) var(--ease-out),color var(--duration-base) var(--ease-out);}
.insp-seg--pill .insp-seg__opt{padding:6px 14px;border-radius:var(--radius-full);}
.insp-seg--pill .insp-seg__opt:hover{color:oklch(var(--foreground-700));}
.insp-seg--pill .insp-seg__opt.is-active{background:oklch(var(--primary-500));color:oklch(var(--background-50));}
.insp-seg--underline .insp-seg__opt{padding:10px 16px;margin-bottom:-1px;border-bottom:2px solid transparent;border-radius:var(--radius-lg) var(--radius-lg) 0 0;}
.insp-seg--underline .insp-seg__opt:hover{color:oklch(var(--foreground-700));background:oklch(var(--background-100) / .5);}
.insp-seg--underline .insp-seg__opt.is-active{color:oklch(var(--primary-700));border-bottom-color:oklch(var(--primary-500));background:oklch(var(--primary-50) / .3);}
.insp-seg__i{display:flex;align-items:center;font-size:1.05em;}
`;

function useCSS() {
  React.useEffect(() => {
    if (document.getElementById("insp-seg-css")) return;
    const s = document.createElement("style");
    s.id = "insp-seg-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }, []);
}

/**
 * SegmentedControl — a single-select group of options.
 * `variant="pill"` is the rounded time-range switcher; `variant="underline"`
 * is the tabbed page-section switcher (Settings tabs).
 * options: [{ value, label, icon? }]
 */
export function SegmentedControl({
  options = [],
  value,
  onChange,
  variant = "pill",
  className = "",
}) {
  useCSS();
  return (
    <div
      className={`insp-seg insp-seg--${variant} ${className}`}
      role="tablist"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          role="tab"
          aria-selected={value === opt.value}
          onClick={() => onChange && onChange(opt.value)}
          className={`insp-seg__opt ${value === opt.value ? "is-active" : ""}`}
        >
          {opt.icon && <i className={`${opt.icon} insp-seg__i`}></i>}
          {opt.label}
        </button>
      ))}
    </div>
  );
}
