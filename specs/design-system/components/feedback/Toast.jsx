import React from "react";

const CSS = `
.insp-toast{display:inline-flex;align-items:center;gap:8px;font-family:var(--font-body);
  font-size:14px;font-weight:500;padding:10px 16px;border-radius:var(--radius-lg);
  animation:inspot-slide-in-right var(--duration-slow) var(--ease-out);}
.insp-toast__i{display:flex;align-items:center;font-size:18px;flex-shrink:0;}
.insp-toast--success{background:oklch(var(--accent-100) / .8);color:oklch(var(--accent-800));}
.insp-toast--error{background:oklch(var(--primary-100) / .7);color:oklch(var(--primary-800));}
.insp-toast--info{background:oklch(var(--secondary-100));color:oklch(var(--secondary-800));}
.insp-toast-fixed{position:fixed;top:16px;right:16px;z-index:50;}
`;

function useCSS() {
  React.useEffect(() => {
    if (document.getElementById("insp-toast-css")) return;
    const s = document.createElement("style");
    s.id = "insp-toast-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }, []);
}

const ICON = {
  success: "ri-check-line",
  error: "ri-error-warning-line",
  info: "ri-information-line",
};

/**
 * Toast — the transient notification that slides in top-right. Tinted, no
 * shadow. `fixed` positions it; drop it unset to place inside your own anchor.
 */
export function Toast({
  variant = "success",
  icon,
  fixed = true,
  children,
  className = "",
}) {
  useCSS();
  const i = icon || ICON[variant];
  return (
    <div
      className={`${fixed ? "insp-toast-fixed" : ""} ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className={`insp-toast insp-toast--${variant}`}>
        <i className={`${i} insp-toast__i`}></i>
        <span>{children}</span>
      </div>
    </div>
  );
}
