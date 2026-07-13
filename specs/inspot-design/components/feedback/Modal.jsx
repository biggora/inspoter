import React from "react";

const CSS = `
.insp-modal-overlay{position:fixed;inset:0;z-index:50;display:flex;align-items:flex-start;justify-content:center;
  padding:10vh 16px 16px;}
.insp-modal-scrim{position:fixed;inset:0;background:var(--overlay-scrim);animation:inspot-fade-in var(--duration-base) var(--ease-out);}
.insp-modal{position:relative;z-index:10;width:100%;max-width:448px;background:oklch(var(--background-50));
  border:1px solid oklch(var(--background-200));border-radius:var(--radius-xl);box-shadow:var(--shadow-modal);
  font-family:var(--font-body);animation:inspot-scale-in var(--duration-base) var(--ease-out);}
.insp-modal--sm{max-width:360px;}
.insp-modal--lg{max-width:560px;}
.insp-modal__head{display:flex;align-items:center;justify-content:space-between;
  padding:16px 20px;border-bottom:1px solid oklch(var(--background-100));}
.insp-modal__title{font-family:var(--font-heading);font-size:16px;font-weight:600;color:oklch(var(--foreground-900));}
.insp-modal__close{width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;
  color:oklch(var(--foreground-400));border-radius:var(--radius-md);cursor:pointer;font-size:18px;
  transition:background-color var(--duration-base) var(--ease-out),color var(--duration-base) var(--ease-out);}
.insp-modal__close:hover{background:oklch(var(--background-100));color:oklch(var(--foreground-700));}
.insp-modal__body{padding:16px 20px;font-size:14px;color:oklch(var(--foreground-700));line-height:1.5;}
.insp-modal__foot{display:flex;align-items:center;justify-content:flex-end;gap:10px;
  padding:12px 20px;border-top:1px solid oklch(var(--background-100));}
`;

function useCSS() {
  React.useEffect(() => {
    if (document.getElementById("insp-modal-css")) return;
    const s = document.createElement("style");
    s.id = "insp-modal-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }, []);
}

/**
 * Modal — centered dialog with scrim, header (title + close), body and an
 * optional footer action row. Closes on scrim click and Escape.
 */
export function Modal({ open, onClose, title, size = "md", footer, children }) {
  useCSS();
  React.useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (e.key === "Escape") onClose && onClose();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="insp-modal-overlay">
      <div
        className="insp-modal-scrim"
        onClick={onClose}
        aria-hidden="true"
      ></div>
      <div
        className={`insp-modal insp-modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="insp-modal__head">
          <span className="insp-modal__title">{title}</span>
          <button
            className="insp-modal__close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <i className="ri-close-line"></i>
          </button>
        </div>
        <div className="insp-modal__body">{children}</div>
        {footer && <div className="insp-modal__foot">{footer}</div>}
      </div>
    </div>
  );
}
