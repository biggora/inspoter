import React from "react";

const CSS = `
.insp-stat{background:oklch(var(--background-50));border:1px solid oklch(var(--background-200));
  border-radius:var(--radius-xl);padding:16px;font-family:var(--font-body);text-align:left;width:100%;display:block;}
.insp-stat--btn{cursor:pointer;transition:border-color var(--duration-base) var(--ease-out);}
.insp-stat--btn:hover{border-color:oklch(var(--background-300));}
.insp-stat__top{display:flex;align-items:center;gap:8px;margin-bottom:12px;}
.insp-stat__label{font-size:12px;font-weight:500;color:oklch(var(--foreground-500));
  text-transform:uppercase;letter-spacing:var(--tracking-wide);}
.insp-stat__value{font-family:var(--font-heading);font-size:24px;font-weight:700;
  color:oklch(var(--foreground-950));line-height:1.1;}
.insp-stat__value .insp-stat__sub{font-size:16px;font-weight:400;color:oklch(var(--foreground-400));}
.insp-stat__subtitle{font-size:11px;color:oklch(var(--foreground-400));margin-top:2px;}
.insp-stat__extra{margin-top:8px;}
`;

function useCSS() {
  React.useEffect(() => {
    if (document.getElementById("insp-stat-css")) return;
    const s = document.createElement("style");
    s.id = "insp-stat-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }, []);
}

const TONE = {
  primary: { bg: "oklch(var(--primary-100))", fg: "oklch(var(--primary-600))" },
  accent: { bg: "oklch(var(--accent-100))", fg: "oklch(var(--accent-600))" },
  secondary: {
    bg: "oklch(var(--secondary-100))",
    fg: "oklch(var(--secondary-600))",
  },
  amber: { bg: "oklch(var(--amber-500) / .18)", fg: "oklch(var(--amber-700))" },
  red: { bg: "oklch(var(--red-500) / .16)", fg: "oklch(var(--red-600))" },
};

/**
 * StatCard — the KPI tile on dashboards: tinted icon + uppercase label, one big
 * number (wrap the denominator in `sub`), optional subtitle and a slot for
 * dot-legends or a progress bar.
 */
export function StatCard({
  icon,
  label,
  value,
  sub,
  subtitle,
  tone = "primary",
  onClick,
  children,
  className = "",
}) {
  useCSS();
  const t = TONE[tone] || TONE.primary;
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={`insp-stat ${onClick ? "insp-stat--btn" : ""} ${className}`}
    >
      <div className="insp-stat__top">
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: "var(--radius-lg)",
            background: t.bg,
            color: t.fg,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 15,
            flexShrink: 0,
          }}
        >
          <i className={icon}></i>
        </span>
        <span className="insp-stat__label">{label}</span>
      </div>
      <p className="insp-stat__value">
        {value}
        {sub != null && <span className="insp-stat__sub">/{sub}</span>}
      </p>
      {subtitle && <p className="insp-stat__subtitle">{subtitle}</p>}
      {children && <div className="insp-stat__extra">{children}</div>}
    </Comp>
  );
}
