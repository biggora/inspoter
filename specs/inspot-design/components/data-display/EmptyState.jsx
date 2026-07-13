import React from "react";

const CSS = `
.insp-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;
  text-align:center;font-family:var(--font-body);padding:40px 24px;max-width:360px;margin:0 auto;
  animation:inspot-scale-in var(--duration-base) var(--ease-out);}
.insp-empty__well{width:64px;height:64px;border-radius:var(--radius-2xl);display:flex;
  align-items:center;justify-content:center;font-size:26px;margin-bottom:20px;}
.insp-empty__well--secondary{background:oklch(var(--secondary-100));color:oklch(var(--secondary-600));}
.insp-empty__well--primary{background:oklch(var(--primary-100));color:oklch(var(--primary-600));}
.insp-empty__well--accent{background:oklch(var(--accent-100));color:oklch(var(--accent-600));}
.insp-empty__title{font-family:var(--font-heading);font-size:18px;font-weight:600;color:oklch(var(--foreground-900));margin:0 0 8px;}
.insp-empty__desc{font-size:14px;color:oklch(var(--foreground-500));margin:0 0 24px;line-height:1.5;}
.insp-empty__desc:last-child{margin-bottom:0;}
`;

function useCSS() {
  React.useEffect(() => {
    if (document.getElementById("insp-empty-css")) return;
    const s = document.createElement("style");
    s.id = "insp-empty-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }, []);
}

/**
 * EmptyState — the centered icon-well + title + text + optional action used for
 * empty lists, "not found", and load errors. `tone` colours the well
 * (`primary` for errors, `secondary` for empty, `accent` for all-clear).
 */
export function EmptyState({
  icon,
  tone = "secondary",
  title,
  description,
  action,
  className = "",
}) {
  useCSS();
  return (
    <div className={`insp-empty ${className}`}>
      <div className={`insp-empty__well insp-empty__well--${tone}`}>
        <i className={icon}></i>
      </div>
      {title && <h3 className="insp-empty__title">{title}</h3>}
      {description && <p className="insp-empty__desc">{description}</p>}
      {action}
    </div>
  );
}
