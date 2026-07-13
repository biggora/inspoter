import React from "react";

const CSS = `
.insp-progress{width:100%;border-radius:var(--radius-full);background:oklch(var(--background-200));overflow:hidden;}
.insp-progress--sm{height:6px;}
.insp-progress--md{height:8px;}
.insp-progress__fill{height:100%;border-radius:var(--radius-full);
  transition:width var(--duration-chart) var(--ease-out);}
.insp-progress__fill--primary{background:oklch(var(--primary-500));}
.insp-progress__fill--accent{background:oklch(var(--accent-500));}
.insp-progress__fill--secondary{background:oklch(var(--secondary-500));}
.insp-progress__fill--amber{background:oklch(var(--amber-500));}
.insp-progress__fill--red{background:oklch(var(--red-500));}
`;

function useCSS() {
  React.useEffect(() => {
    if (document.getElementById("insp-progress-css")) return;
    const s = document.createElement("style");
    s.id = "insp-progress-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }, []);
}

/**
 * ProgressBar — thin meter for CPU/RAM/disk load and read progress.
 * `auto` colouring maps value→tone (green <60, amber <85, red ≥85) for
 * resource-utilisation bars.
 */
export function ProgressBar({
  value = 0,
  tone = "accent",
  size = "sm",
  auto = false,
  className = "",
}) {
  useCSS();
  const v = Math.max(0, Math.min(100, value));
  let t = tone;
  if (auto) t = v >= 85 ? "red" : v >= 60 ? "amber" : "accent";
  return (
    <div
      className={`insp-progress insp-progress--${size} ${className}`}
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`insp-progress__fill insp-progress__fill--${t}`}
        style={{ width: `${v}%` }}
      ></div>
    </div>
  );
}
