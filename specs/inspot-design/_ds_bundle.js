/* @ds-bundle: {"format":4,"namespace":"InspotDesignSystem_abeb6a","components":[{"name":"Badge","sourcePath":"components/data-display/Badge.jsx"},{"name":"Card","sourcePath":"components/data-display/Card.jsx"},{"name":"EmptyState","sourcePath":"components/data-display/EmptyState.jsx"},{"name":"IconTile","sourcePath":"components/data-display/IconTile.jsx"},{"name":"ProgressBar","sourcePath":"components/data-display/ProgressBar.jsx"},{"name":"StatCard","sourcePath":"components/data-display/StatCard.jsx"},{"name":"Dropdown","sourcePath":"components/feedback/Dropdown.jsx"},{"name":"DropdownItem","sourcePath":"components/feedback/Dropdown.jsx"},{"name":"DropdownSep","sourcePath":"components/feedback/Dropdown.jsx"},{"name":"DropdownLabel","sourcePath":"components/feedback/Dropdown.jsx"},{"name":"Modal","sourcePath":"components/feedback/Modal.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Button","sourcePath":"components/forms/Button.jsx"},{"name":"IconButton","sourcePath":"components/forms/IconButton.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"SegmentedControl","sourcePath":"components/forms/SegmentedControl.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"}],"sourceHashes":{"components/data-display/Badge.jsx":"75fdc1c89a3b","components/data-display/Card.jsx":"e362db2132c3","components/data-display/EmptyState.jsx":"55401bc88633","components/data-display/IconTile.jsx":"46fd6060b0ae","components/data-display/ProgressBar.jsx":"c98487c69f2b","components/data-display/StatCard.jsx":"2d24e0a052d1","components/feedback/Dropdown.jsx":"b2cb3715da98","components/feedback/Modal.jsx":"cd5c7ee594a8","components/feedback/Toast.jsx":"e104b79f47d8","components/forms/Button.jsx":"e84a6f46321c","components/forms/IconButton.jsx":"bf16c486dcef","components/forms/Input.jsx":"1eed7c1fd662","components/forms/SegmentedControl.jsx":"9e149cb0cf06","components/forms/Switch.jsx":"b8b14875ee32","ui_kits/inspot/DashboardScreen.jsx":"4a9103b46bf0","ui_kits/inspot/LoginScreen.jsx":"4fb40ce7f1da","ui_kits/inspot/LogsScreen.jsx":"91f9abcb76c3","ui_kits/inspot/ServersScreen.jsx":"17ca6a26c499","ui_kits/inspot/SettingsScreen.jsx":"e8248a233df4","ui_kits/inspot/Shell.jsx":"159a8327c228","ui_kits/inspot/data.js":"92a779012753"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {
  const __ds_ns = (window.InspotDesignSystem_abeb6a =
    window.InspotDesignSystem_abeb6a || {});

  const __ds_scope = {};

  __ds_ns.__errors = __ds_ns.__errors || [];

  // components/data-display/Badge.jsx
  try {
    (() => {
      const CSS = `
.insp-badge{display:inline-flex;align-items:center;gap:6px;font-family:var(--font-body);
  font-weight:500;white-space:nowrap;border-radius:var(--radius-full);line-height:1;}
.insp-badge--sm{font-size:10px;padding:2px 8px;}
.insp-badge--md{font-size:12px;padding:4px 10px;}
.insp-badge__dot{width:6px;height:6px;border-radius:var(--radius-full);flex-shrink:0;}
.insp-badge__i{display:flex;align-items:center;font-size:1em;}
.insp-badge--pulse .insp-badge__dot{animation:insp-badge-pulse 1.4s ease-in-out infinite;}
@keyframes insp-badge-pulse{0%,100%{opacity:1;}50%{opacity:.35;}}
/* tones: bg tint + text */
.insp-badge--accent{background:oklch(var(--accent-100));color:oklch(var(--accent-700));}
.insp-badge--accent .insp-badge__dot{background:oklch(var(--accent-500));}
.insp-badge--primary{background:oklch(var(--primary-100));color:oklch(var(--primary-700));}
.insp-badge--primary .insp-badge__dot{background:oklch(var(--primary-500));}
.insp-badge--amber{background:oklch(var(--amber-500) / .18);color:oklch(var(--amber-700));}
.insp-badge--amber .insp-badge__dot{background:oklch(var(--amber-500));}
.insp-badge--red{background:oklch(var(--red-500) / .16);color:oklch(var(--red-700));}
.insp-badge--red .insp-badge__dot{background:oklch(var(--red-500));}
.insp-badge--secondary{background:oklch(var(--secondary-100));color:oklch(var(--secondary-700));}
.insp-badge--secondary .insp-badge__dot{background:oklch(var(--secondary-400));}
.insp-badge--neutral{background:oklch(var(--background-200));color:oklch(var(--foreground-500));}
.insp-badge--neutral .insp-badge__dot{background:oklch(var(--foreground-300));}
`;
      function useCSS() {
        React.useEffect(() => {
          if (document.getElementById("insp-badge-css")) return;
          const s = document.createElement("style");
          s.id = "insp-badge-css";
          s.textContent = CSS;
          document.head.appendChild(s);
        }, []);
      }

      /**
       * Badge — status pill. Optional leading status dot or icon.
       * tones: accent (ok/online) · amber (warn) · red (danger) · primary · secondary (idle) · neutral
       */
      function Badge({
        tone = "neutral",
        size = "md",
        dot = false,
        pulse = false,
        icon,
        children,
        className = "",
      }) {
        useCSS();
        const cls = [
          "insp-badge",
          `insp-badge--${tone}`,
          `insp-badge--${size}`,
          pulse ? "insp-badge--pulse" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ");
        return /*#__PURE__*/ React.createElement(
          "span",
          {
            className: cls,
          },
          dot &&
            /*#__PURE__*/ React.createElement("span", {
              className: "insp-badge__dot",
            }),
          icon &&
            /*#__PURE__*/ React.createElement("i", {
              className: `${icon} insp-badge__i`,
            }),
          children,
        );
      }
      Object.assign(__ds_scope, { Badge });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: "components/data-display/Badge.jsx",
      error: String((e && e.message) || e),
    });
  }

  // components/data-display/Card.jsx
  try {
    (() => {
      const CSS = `
.insp-card{background:oklch(var(--background-50));border:1px solid oklch(var(--background-200));
  border-radius:var(--radius-xl);font-family:var(--font-body);color:oklch(var(--foreground-900));}
.insp-card--pad{padding:20px;}
.insp-card--pad-sm{padding:16px;}
.insp-card--hover{transition:border-color var(--duration-base) var(--ease-out);}
.insp-card--hover:hover{border-color:oklch(var(--background-300));}
.insp-card--clickable{cursor:pointer;text-align:left;width:100%;display:block;}
.insp-card__head{display:flex;align-items:center;justify-content:space-between;
  padding:14px 20px;border-bottom:1px solid oklch(var(--background-100));}
.insp-card__head-l{display:flex;align-items:center;gap:10px;}
.insp-card__title{font-family:var(--font-heading);font-size:14px;font-weight:600;color:oklch(var(--foreground-900));}
.insp-card__body{padding:20px;}
`;
      function useCSS() {
        React.useEffect(() => {
          if (document.getElementById("insp-card-css")) return;
          const s = document.createElement("style");
          s.id = "insp-card-css";
          s.textContent = CSS;
          document.head.appendChild(s);
        }, []);
      }

      /**
       * Card — the surface primitive: 1px border, 12px radius, no shadow.
       * Pass `title` (with optional `icon`/`action`) to get the standard header +
       * body split; otherwise it's a padded container (`padding` controls inset).
       */
      function Card({
        title,
        icon,
        action,
        hover = false,
        onClick,
        padding = "md",
        children,
        className = "",
      }) {
        useCSS();
        const clickable = !!onClick;
        const Comp = clickable ? "button" : "div";
        if (title) {
          return /*#__PURE__*/ React.createElement(
            Comp,
            {
              onClick: onClick,
              className: [
                "insp-card",
                hover || clickable ? "insp-card--hover" : "",
                clickable ? "insp-card--clickable" : "",
                className,
              ]
                .filter(Boolean)
                .join(" "),
            },
            /*#__PURE__*/ React.createElement(
              "div",
              {
                className: "insp-card__head",
              },
              /*#__PURE__*/ React.createElement(
                "div",
                {
                  className: "insp-card__head-l",
                },
                icon,
                /*#__PURE__*/ React.createElement(
                  "span",
                  {
                    className: "insp-card__title",
                  },
                  title,
                ),
              ),
              action,
            ),
            /*#__PURE__*/ React.createElement(
              "div",
              {
                className: "insp-card__body",
              },
              children,
            ),
          );
        }
        const padCls =
          padding === "none"
            ? ""
            : padding === "sm"
              ? "insp-card--pad-sm"
              : "insp-card--pad";
        return /*#__PURE__*/ React.createElement(
          Comp,
          {
            onClick: onClick,
            className: [
              "insp-card",
              padCls,
              hover || clickable ? "insp-card--hover" : "",
              clickable ? "insp-card--clickable" : "",
              className,
            ]
              .filter(Boolean)
              .join(" "),
          },
          children,
        );
      }
      Object.assign(__ds_scope, { Card });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: "components/data-display/Card.jsx",
      error: String((e && e.message) || e),
    });
  }

  // components/data-display/EmptyState.jsx
  try {
    (() => {
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
      function EmptyState({
        icon,
        tone = "secondary",
        title,
        description,
        action,
        className = "",
      }) {
        useCSS();
        return /*#__PURE__*/ React.createElement(
          "div",
          {
            className: `insp-empty ${className}`,
          },
          /*#__PURE__*/ React.createElement(
            "div",
            {
              className: `insp-empty__well insp-empty__well--${tone}`,
            },
            /*#__PURE__*/ React.createElement("i", {
              className: icon,
            }),
          ),
          title &&
            /*#__PURE__*/ React.createElement(
              "h3",
              {
                className: "insp-empty__title",
              },
              title,
            ),
          description &&
            /*#__PURE__*/ React.createElement(
              "p",
              {
                className: "insp-empty__desc",
              },
              description,
            ),
          action,
        );
      }
      Object.assign(__ds_scope, { EmptyState });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: "components/data-display/EmptyState.jsx",
      error: String((e && e.message) || e),
    });
  }

  // components/data-display/IconTile.jsx
  try {
    (() => {
      const CSS = `
.insp-tile{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;}
.insp-tile--sm{width:28px;height:28px;border-radius:var(--radius-md);font-size:13px;}
.insp-tile--md{width:32px;height:32px;border-radius:var(--radius-lg);font-size:15px;}
.insp-tile--lg{width:36px;height:36px;border-radius:var(--radius-lg);font-size:18px;}
.insp-tile--xl{width:64px;height:64px;border-radius:var(--radius-2xl);font-size:26px;}
.insp-tile--primary{background:oklch(var(--primary-100));color:oklch(var(--primary-600));}
.insp-tile--accent{background:oklch(var(--accent-100));color:oklch(var(--accent-600));}
.insp-tile--secondary{background:oklch(var(--secondary-100));color:oklch(var(--secondary-600));}
.insp-tile--amber{background:oklch(var(--amber-500) / .18);color:oklch(var(--amber-700));}
.insp-tile--red{background:oklch(var(--red-500) / .16);color:oklch(var(--red-600));}
.insp-tile--neutral{background:oklch(var(--background-100));color:oklch(var(--foreground-500));}
`;
      function useCSS() {
        React.useEffect(() => {
          if (document.getElementById("insp-tile-css")) return;
          const s = document.createElement("style");
          s.id = "insp-tile-css";
          s.textContent = CSS;
          document.head.appendChild(s);
        }, []);
      }

      /**
       * IconTile — the rounded tinted square that carries an icon. Inspot's most
       * repeated motif: it prefixes widget headers, list rows, stat cards and
       * empty states. `xl` is the empty-state well.
       */
      function IconTile({
        icon,
        tone = "secondary",
        size = "md",
        className = "",
      }) {
        useCSS();
        return /*#__PURE__*/ React.createElement(
          "span",
          {
            className: `insp-tile insp-tile--${tone} insp-tile--${size} ${className}`,
          },
          /*#__PURE__*/ React.createElement("i", {
            className: icon,
          }),
        );
      }
      Object.assign(__ds_scope, { IconTile });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: "components/data-display/IconTile.jsx",
      error: String((e && e.message) || e),
    });
  }

  // components/data-display/ProgressBar.jsx
  try {
    (() => {
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
      function ProgressBar({
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
        return /*#__PURE__*/ React.createElement(
          "div",
          {
            className: `insp-progress insp-progress--${size} ${className}`,
            role: "progressbar",
            "aria-valuenow": v,
            "aria-valuemin": 0,
            "aria-valuemax": 100,
          },
          /*#__PURE__*/ React.createElement("div", {
            className: `insp-progress__fill insp-progress__fill--${t}`,
            style: {
              width: `${v}%`,
            },
          }),
        );
      }
      Object.assign(__ds_scope, { ProgressBar });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: "components/data-display/ProgressBar.jsx",
      error: String((e && e.message) || e),
    });
  }

  // components/data-display/StatCard.jsx
  try {
    (() => {
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
        primary: {
          bg: "oklch(var(--primary-100))",
          fg: "oklch(var(--primary-600))",
        },
        accent: {
          bg: "oklch(var(--accent-100))",
          fg: "oklch(var(--accent-600))",
        },
        secondary: {
          bg: "oklch(var(--secondary-100))",
          fg: "oklch(var(--secondary-600))",
        },
        amber: {
          bg: "oklch(var(--amber-500) / .18)",
          fg: "oklch(var(--amber-700))",
        },
        red: {
          bg: "oklch(var(--red-500) / .16)",
          fg: "oklch(var(--red-600))",
        },
      };

      /**
       * StatCard — the KPI tile on dashboards: tinted icon + uppercase label, one big
       * number (wrap the denominator in `sub`), optional subtitle and a slot for
       * dot-legends or a progress bar.
       */
      function StatCard({
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
        return /*#__PURE__*/ React.createElement(
          Comp,
          {
            onClick: onClick,
            className: `insp-stat ${onClick ? "insp-stat--btn" : ""} ${className}`,
          },
          /*#__PURE__*/ React.createElement(
            "div",
            {
              className: "insp-stat__top",
            },
            /*#__PURE__*/ React.createElement(
              "span",
              {
                style: {
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
                },
              },
              /*#__PURE__*/ React.createElement("i", {
                className: icon,
              }),
            ),
            /*#__PURE__*/ React.createElement(
              "span",
              {
                className: "insp-stat__label",
              },
              label,
            ),
          ),
          /*#__PURE__*/ React.createElement(
            "p",
            {
              className: "insp-stat__value",
            },
            value,
            sub != null &&
              /*#__PURE__*/ React.createElement(
                "span",
                {
                  className: "insp-stat__sub",
                },
                "/",
                sub,
              ),
          ),
          subtitle &&
            /*#__PURE__*/ React.createElement(
              "p",
              {
                className: "insp-stat__subtitle",
              },
              subtitle,
            ),
          children &&
            /*#__PURE__*/ React.createElement(
              "div",
              {
                className: "insp-stat__extra",
              },
              children,
            ),
        );
      }
      Object.assign(__ds_scope, { StatCard });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: "components/data-display/StatCard.jsx",
      error: String((e && e.message) || e),
    });
  }

  // components/feedback/Dropdown.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t)
                    ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
      const CSS = `
.insp-dd{position:relative;display:inline-block;font-family:var(--font-body);}
.insp-dd__menu{position:absolute;z-index:40;min-width:180px;margin-top:4px;
  background:oklch(var(--background-50));border:1px solid oklch(var(--background-200));
  border-radius:var(--radius-lg);box-shadow:var(--shadow-menu);padding:4px;overflow:hidden;
  animation:inspot-scale-in var(--duration-fast) var(--ease-out);transform-origin:top;}
.insp-dd__menu--right{right:0;}
.insp-dd__menu--left{left:0;}
.insp-dd__item{width:100%;display:flex;align-items:center;gap:10px;text-align:left;
  padding:8px 10px;border:none;background:transparent;cursor:pointer;border-radius:var(--radius-md);
  font-size:14px;color:oklch(var(--foreground-700));white-space:nowrap;
  transition:background-color var(--duration-base) var(--ease-out),color var(--duration-base) var(--ease-out);}
.insp-dd__item:hover{background:oklch(var(--background-100));}
.insp-dd__item.is-active{background:oklch(var(--primary-50));color:oklch(var(--primary-700));}
.insp-dd__item--danger{color:oklch(var(--primary-600));}
.insp-dd__item--danger:hover{background:oklch(var(--primary-50));}
.insp-dd__item i{display:flex;align-items:center;font-size:16px;}
.insp-dd__sep{height:1px;background:oklch(var(--background-100));margin:4px 0;}
.insp-dd__label{padding:6px 10px 4px;font-size:11px;font-weight:600;text-transform:uppercase;
  letter-spacing:var(--tracking-wide);color:oklch(var(--foreground-400));}
`;
      function useCSS() {
        React.useEffect(() => {
          if (document.getElementById("insp-dd-css")) return;
          const s = document.createElement("style");
          s.id = "insp-dd-css";
          s.textContent = CSS;
          document.head.appendChild(s);
        }, []);
      }

      /**
       * Dropdown — anchored menu that opens under a trigger. Uncontrolled: manages
       * its own open state, closes on outside click and item selection. Compose items
       * with the exported <DropdownItem>, <DropdownSep> and <DropdownLabel>.
       */
      function Dropdown({ trigger, align = "left", children, className = "" }) {
        useCSS();
        const [open, setOpen] = React.useState(false);
        const ref = React.useRef(null);
        React.useEffect(() => {
          if (!open) return;
          const h = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
          };
          document.addEventListener("mousedown", h);
          return () => document.removeEventListener("mousedown", h);
        }, [open]);
        return /*#__PURE__*/ React.createElement(
          "div",
          {
            className: `insp-dd ${className}`,
            ref: ref,
          },
          /*#__PURE__*/ React.createElement(
            "span",
            {
              onClick: () => setOpen((o) => !o),
            },
            trigger,
          ),
          open &&
            /*#__PURE__*/ React.createElement(
              "div",
              {
                className: `insp-dd__menu insp-dd__menu--${align}`,
                onClick: () => setOpen(false),
              },
              children,
            ),
        );
      }
      function DropdownItem({
        icon,
        active = false,
        danger = false,
        children,
        ...rest
      }) {
        useCSS();
        const cls = [
          "insp-dd__item",
          active ? "is-active" : "",
          danger ? "insp-dd__item--danger" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return /*#__PURE__*/ React.createElement(
          "button",
          _extends(
            {
              className: cls,
            },
            rest,
          ),
          icon &&
            /*#__PURE__*/ React.createElement("i", {
              className: icon,
            }),
          children,
        );
      }
      function DropdownSep() {
        useCSS();
        return /*#__PURE__*/ React.createElement("div", {
          className: "insp-dd__sep",
        });
      }
      function DropdownLabel({ children }) {
        useCSS();
        return /*#__PURE__*/ React.createElement(
          "div",
          {
            className: "insp-dd__label",
          },
          children,
        );
      }
      Object.assign(__ds_scope, {
        Dropdown,
        DropdownItem,
        DropdownSep,
        DropdownLabel,
      });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: "components/feedback/Dropdown.jsx",
      error: String((e && e.message) || e),
    });
  }

  // components/feedback/Modal.jsx
  try {
    (() => {
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
      function Modal({ open, onClose, title, size = "md", footer, children }) {
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
        return /*#__PURE__*/ React.createElement(
          "div",
          {
            className: "insp-modal-overlay",
          },
          /*#__PURE__*/ React.createElement("div", {
            className: "insp-modal-scrim",
            onClick: onClose,
            "aria-hidden": "true",
          }),
          /*#__PURE__*/ React.createElement(
            "div",
            {
              className: `insp-modal insp-modal--${size}`,
              role: "dialog",
              "aria-modal": "true",
              "aria-label": title,
            },
            /*#__PURE__*/ React.createElement(
              "div",
              {
                className: "insp-modal__head",
              },
              /*#__PURE__*/ React.createElement(
                "span",
                {
                  className: "insp-modal__title",
                },
                title,
              ),
              /*#__PURE__*/ React.createElement(
                "button",
                {
                  className: "insp-modal__close",
                  onClick: onClose,
                  "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C",
                },
                /*#__PURE__*/ React.createElement("i", {
                  className: "ri-close-line",
                }),
              ),
            ),
            /*#__PURE__*/ React.createElement(
              "div",
              {
                className: "insp-modal__body",
              },
              children,
            ),
            footer &&
              /*#__PURE__*/ React.createElement(
                "div",
                {
                  className: "insp-modal__foot",
                },
                footer,
              ),
          ),
        );
      }
      Object.assign(__ds_scope, { Modal });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: "components/feedback/Modal.jsx",
      error: String((e && e.message) || e),
    });
  }

  // components/feedback/Toast.jsx
  try {
    (() => {
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
      function Toast({
        variant = "success",
        icon,
        fixed = true,
        children,
        className = "",
      }) {
        useCSS();
        const i = icon || ICON[variant];
        return /*#__PURE__*/ React.createElement(
          "div",
          {
            className: `${fixed ? "insp-toast-fixed" : ""} ${className}`,
            role: "status",
            "aria-live": "polite",
          },
          /*#__PURE__*/ React.createElement(
            "div",
            {
              className: `insp-toast insp-toast--${variant}`,
            },
            /*#__PURE__*/ React.createElement("i", {
              className: `${i} insp-toast__i`,
            }),
            /*#__PURE__*/ React.createElement("span", null, children),
          ),
        );
      }
      Object.assign(__ds_scope, { Toast });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: "components/feedback/Toast.jsx",
      error: String((e && e.message) || e),
    });
  }

  // components/forms/Button.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t)
                    ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
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
          if (document.getElementById("insp-btn-css")) return;
          const s = document.createElement("style");
          s.id = "insp-btn-css";
          s.textContent = CSS;
          document.head.appendChild(s);
        }, []);
      }

      /**
       * Button — Inspot's primary action control.
       * variants: primary (terracotta fill) · secondary (outline) · ghost · danger
       * sizes: sm · md · lg
       */
      function Button({
        variant = "primary",
        size = "md",
        icon,
        iconRight,
        block = false,
        loading = false,
        disabled = false,
        children,
        className = "",
        ...rest
      }) {
        useCSS();
        const cls = [
          "insp-btn",
          `insp-btn--${variant}`,
          `insp-btn--${size}`,
          block ? "insp-btn--block" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ");
        return /*#__PURE__*/ React.createElement(
          "button",
          _extends(
            {
              className: cls,
              disabled: disabled || loading,
            },
            rest,
          ),
          loading
            ? /*#__PURE__*/ React.createElement("i", {
                className: "ri-loader-4-line insp-btn__i",
                style: {
                  animation: "spin 0.7s linear infinite",
                },
              })
            : icon &&
                /*#__PURE__*/ React.createElement("i", {
                  className: `${icon} insp-btn__i`,
                }),
          children && /*#__PURE__*/ React.createElement("span", null, children),
          iconRight &&
            !loading &&
            /*#__PURE__*/ React.createElement("i", {
              className: `${iconRight} insp-btn__i`,
            }),
        );
      }
      Object.assign(__ds_scope, { Button });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: "components/forms/Button.jsx",
      error: String((e && e.message) || e),
    });
  }

  // components/forms/IconButton.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t)
                    ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
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
          if (document.getElementById("insp-iconbtn-css")) return;
          const s = document.createElement("style");
          s.id = "insp-iconbtn-css";
          s.textContent = CSS;
          document.head.appendChild(s);
        }, []);
      }

      /**
       * IconButton — square, icon-only control for topbars, toolbars and menus.
       */
      function IconButton({
        icon,
        size = "md",
        bordered = false,
        className = "",
        ...rest
      }) {
        useCSS();
        const cls = [
          "insp-iconbtn",
          `insp-iconbtn--${size}`,
          bordered ? "insp-iconbtn--bordered" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ");
        return /*#__PURE__*/ React.createElement(
          "button",
          _extends(
            {
              className: cls,
            },
            rest,
          ),
          /*#__PURE__*/ React.createElement("i", {
            className: icon,
          }),
        );
      }
      Object.assign(__ds_scope, { IconButton });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: "components/forms/IconButton.jsx",
      error: String((e && e.message) || e),
    });
  }

  // components/forms/Input.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t)
                    ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
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
          if (document.getElementById("insp-input-css")) return;
          const s = document.createElement("style");
          s.id = "insp-input-css";
          s.textContent = CSS;
          document.head.appendChild(s);
        }, []);
      }

      /**
       * Input — single-line text field with optional label, leading icon,
       * trailing action (e.g. password reveal, clear), hint and error text.
       */
      function Input({
        label,
        leadingIcon,
        trailingIcon,
        onTrailingClick,
        hint,
        error,
        id,
        className = "",
        ...rest
      }) {
        useCSS();
        const fieldId = id || React.useId();
        return /*#__PURE__*/ React.createElement(
          "div",
          {
            className: `insp-field ${className}`,
          },
          label &&
            /*#__PURE__*/ React.createElement(
              "label",
              {
                className: "insp-field__label",
                htmlFor: fieldId,
              },
              label,
            ),
          /*#__PURE__*/ React.createElement(
            "div",
            {
              className: "insp-input-wrap",
            },
            leadingIcon &&
              /*#__PURE__*/ React.createElement("i", {
                className: `${leadingIcon} insp-input__lead`,
              }),
            /*#__PURE__*/ React.createElement(
              "input",
              _extends(
                {
                  id: fieldId,
                  className: [
                    "insp-input",
                    leadingIcon ? "insp-input--has-lead" : "",
                    trailingIcon ? "insp-input--has-trail" : "",
                    error ? "insp-input--err" : "",
                  ]
                    .filter(Boolean)
                    .join(" "),
                },
                rest,
              ),
            ),
            trailingIcon &&
              /*#__PURE__*/ React.createElement(
                "button",
                {
                  type: "button",
                  className: "insp-input__trail",
                  onClick: onTrailingClick,
                  tabIndex: -1,
                  "aria-hidden": "true",
                },
                /*#__PURE__*/ React.createElement("i", {
                  className: trailingIcon,
                }),
              ),
          ),
          error
            ? /*#__PURE__*/ React.createElement(
                "span",
                {
                  className: "insp-field__err",
                },
                error,
              )
            : hint &&
                /*#__PURE__*/ React.createElement(
                  "span",
                  {
                    className: "insp-field__hint",
                  },
                  hint,
                ),
        );
      }
      Object.assign(__ds_scope, { Input });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: "components/forms/Input.jsx",
      error: String((e && e.message) || e),
    });
  }

  // components/forms/SegmentedControl.jsx
  try {
    (() => {
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
      function SegmentedControl({
        options = [],
        value,
        onChange,
        variant = "pill",
        className = "",
      }) {
        useCSS();
        return /*#__PURE__*/ React.createElement(
          "div",
          {
            className: `insp-seg insp-seg--${variant} ${className}`,
            role: "tablist",
          },
          options.map((opt) =>
            /*#__PURE__*/ React.createElement(
              "button",
              {
                key: opt.value,
                role: "tab",
                "aria-selected": value === opt.value,
                onClick: () => onChange && onChange(opt.value),
                className: `insp-seg__opt ${value === opt.value ? "is-active" : ""}`,
              },
              opt.icon &&
                /*#__PURE__*/ React.createElement("i", {
                  className: `${opt.icon} insp-seg__i`,
                }),
              opt.label,
            ),
          ),
        );
      }
      Object.assign(__ds_scope, { SegmentedControl });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: "components/forms/SegmentedControl.jsx",
      error: String((e && e.message) || e),
    });
  }

  // components/forms/Switch.jsx
  try {
    (() => {
      function _extends() {
        return (
          (_extends = Object.assign
            ? Object.assign.bind()
            : function (n) {
                for (var e = 1; e < arguments.length; e++) {
                  var t = arguments[e];
                  for (var r in t)
                    ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);
                }
                return n;
              }),
          _extends.apply(null, arguments)
        );
      }
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
      function Switch({
        checked = false,
        onChange,
        disabled = false,
        label,
        description,
        className = "",
        ...rest
      }) {
        useCSS();
        const toggle = /*#__PURE__*/ React.createElement(
          "button",
          _extends(
            {
              type: "button",
              role: "switch",
              "aria-checked": checked,
              "aria-label": typeof label === "string" ? label : undefined,
              disabled: disabled,
              onClick: () => onChange && onChange(!checked),
              className: `insp-switch ${checked ? "insp-switch--on" : ""}`,
            },
            rest,
          ),
          /*#__PURE__*/ React.createElement("span", {
            className: "insp-switch__knob",
          }),
        );
        if (!label && !description)
          return React.cloneElement(toggle, {
            className: `insp-switch ${checked ? "insp-switch--on" : ""} ${className}`,
          });
        return /*#__PURE__*/ React.createElement(
          "div",
          {
            className: `insp-switch-row ${className}`,
          },
          /*#__PURE__*/ React.createElement(
            "div",
            null,
            /*#__PURE__*/ React.createElement(
              "p",
              {
                className: "insp-switch-row__t",
              },
              label,
            ),
            description &&
              /*#__PURE__*/ React.createElement(
                "p",
                {
                  className: "insp-switch-row__d",
                },
                description,
              ),
          ),
          toggle,
        );
      }
      Object.assign(__ds_scope, { Switch });
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: "components/forms/Switch.jsx",
      error: String((e && e.message) || e),
    });
  }

  // ui_kits/inspot/DashboardScreen.jsx
  try {
    (() => {
      // Dashboard screen.
      const { StatCard, Card, IconTile, Badge, ProgressBar, Button } =
        window.InspotDesignSystem_abeb6a;
      function WidgetLink({ label, onClick }) {
        return /*#__PURE__*/ React.createElement(
          "button",
          {
            onClick: onClick,
            style: {
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              fontSize: 12,
              fontWeight: 500,
              color: "oklch(var(--foreground-400))",
              whiteSpace: "nowrap",
            },
            onMouseEnter: (e) =>
              (e.currentTarget.style.color = "oklch(var(--foreground-700))"),
            onMouseLeave: (e) =>
              (e.currentTarget.style.color = "oklch(var(--foreground-400))"),
          },
          label,
          /*#__PURE__*/ React.createElement("i", {
            className: "ri-arrow-right-line",
          }),
        );
      }
      function DashboardScreen({ onNavigate }) {
        const D = window.INSPOT_DATA;
        const online = D.servers.filter((s) => s.status === "running").length;
        const th = {
          textAlign: "left",
          padding: "10px 0",
          fontSize: 11,
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: ".04em",
          color: "oklch(var(--foreground-400))",
          borderBottom: "1px solid oklch(var(--background-100))",
        };
        const td = {
          padding: "12px 0",
          borderBottom: "1px solid oklch(var(--background-100))",
          fontSize: 13,
        };
        return /*#__PURE__*/ React.createElement(
          "div",
          {
            style: {
              padding: 24,
            },
          },
          /*#__PURE__*/ React.createElement(
            "div",
            {
              style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 24,
              },
            },
            /*#__PURE__*/ React.createElement(
              "div",
              null,
              /*#__PURE__*/ React.createElement(
                "h2",
                {
                  style: {
                    fontFamily: "var(--font-heading)",
                    fontSize: 20,
                    fontWeight: 700,
                    color: "oklch(var(--foreground-950))",
                    margin: 0,
                  },
                },
                "\u0414\u0430\u0448\u0431\u043E\u0440\u0434",
              ),
              /*#__PURE__*/ React.createElement(
                "p",
                {
                  style: {
                    fontSize: 12,
                    color: "oklch(var(--foreground-400))",
                    margin: "4px 0 0",
                  },
                },
                "\u041E\u0431\u0437\u043E\u0440\u043D\u043E\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0432\u0441\u0435\u0439 \u0438\u043D\u0444\u0440\u0430\u0441\u0442\u0440\u0443\u043A\u0442\u0443\u0440\u044B Inspot",
              ),
            ),
            /*#__PURE__*/ React.createElement(
              Button,
              {
                variant: "ghost",
                size: "sm",
                icon: "ri-refresh-line",
              },
              "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C",
            ),
          ),
          /*#__PURE__*/ React.createElement(
            "div",
            {
              style: {
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 16,
                marginBottom: 24,
              },
            },
            /*#__PURE__*/ React.createElement(
              StatCard,
              {
                icon: "ri-server-line",
                label: "\u0421\u0435\u0440\u0432\u0435\u0440\u044B",
                value: online,
                sub: D.servers.length,
                subtitle: "\u0432 \u0441\u0435\u0442\u0438",
                tone: "accent",
                onClick: () => onNavigate("servers"),
              },
              /*#__PURE__*/ React.createElement(
                "span",
                {
                  style: {
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 11,
                    color: "oklch(var(--accent-600))",
                  },
                },
                /*#__PURE__*/ React.createElement("span", {
                  style: {
                    width: 6,
                    height: 6,
                    borderRadius: 9999,
                    background: "oklch(var(--accent-500))",
                  },
                }),
                online,
                " online",
              ),
            ),
            /*#__PURE__*/ React.createElement(
              StatCard,
              {
                icon: "ri-global-line",
                label: "\u0414\u043E\u043C\u0435\u043D\u044B",
                value: 3,
                sub: 4,
                subtitle: "\u0430\u043A\u0442\u0438\u0432\u043D\u044B",
                tone: "primary",
                onClick: () => onNavigate("domains"),
              },
              /*#__PURE__*/ React.createElement(
                "span",
                {
                  style: {
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                    color: "oklch(var(--amber-700))",
                    fontWeight: 500,
                  },
                },
                /*#__PURE__*/ React.createElement("i", {
                  className: "ri-timer-line",
                }),
                "1 \u0438\u0441\u0442\u0435\u043A\u0430\u0435\u0442",
              ),
            ),
            /*#__PURE__*/ React.createElement(
              StatCard,
              {
                icon: "ri-alert-line",
                label:
                  "\u041E\u043F\u043E\u0432\u0435\u0449\u0435\u043D\u0438\u044F",
                value: 4,
                subtitle:
                  "\u043D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u044B",
                tone: "amber",
                onClick: () => onNavigate("alerts"),
              },
              /*#__PURE__*/ React.createElement(
                "span",
                {
                  style: {
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 11,
                    color: "oklch(var(--red-600))",
                    fontWeight: 500,
                  },
                },
                /*#__PURE__*/ React.createElement("span", {
                  style: {
                    width: 6,
                    height: 6,
                    borderRadius: 9999,
                    background: "oklch(var(--red-500))",
                  },
                }),
                "2 \u043A\u0440\u0438\u0442.",
              ),
            ),
            /*#__PURE__*/ React.createElement(
              StatCard,
              {
                icon: "ri-mail-line",
                label: "\u041F\u043E\u0447\u0442\u0430",
                value: 2,
                sub: 4,
                subtitle:
                  "\u043D\u0435 \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043E",
                tone: "secondary",
                onClick: () => onNavigate("mail"),
              },
              /*#__PURE__*/ React.createElement(ProgressBar, {
                value: 50,
                tone: "secondary",
              }),
            ),
          ),
          /*#__PURE__*/ React.createElement(
            "div",
            {
              style: {
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 20,
              },
            },
            /*#__PURE__*/ React.createElement(
              Card,
              {
                title:
                  "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0441\u0435\u0440\u0432\u0435\u0440\u043E\u0432",
                icon: /*#__PURE__*/ React.createElement(IconTile, {
                  icon: "ri-server-line",
                  tone: "secondary",
                  size: "sm",
                }),
                action: /*#__PURE__*/ React.createElement(WidgetLink, {
                  label:
                    "\u0412\u0441\u0435 \u0441\u0435\u0440\u0432\u0435\u0440\u044B",
                  onClick: () => onNavigate("servers"),
                }),
              },
              /*#__PURE__*/ React.createElement(
                "table",
                {
                  style: {
                    width: "100%",
                    borderCollapse: "collapse",
                  },
                },
                /*#__PURE__*/ React.createElement(
                  "thead",
                  null,
                  /*#__PURE__*/ React.createElement(
                    "tr",
                    null,
                    /*#__PURE__*/ React.createElement(
                      "th",
                      {
                        style: th,
                      },
                      "\u0421\u0435\u0440\u0432\u0435\u0440",
                    ),
                    /*#__PURE__*/ React.createElement(
                      "th",
                      {
                        style: th,
                      },
                      "\u0421\u0442\u0430\u0442\u0443\u0441",
                    ),
                    /*#__PURE__*/ React.createElement(
                      "th",
                      {
                        style: {
                          ...th,
                          textAlign: "right",
                        },
                      },
                      "CPU",
                    ),
                    /*#__PURE__*/ React.createElement(
                      "th",
                      {
                        style: {
                          ...th,
                          textAlign: "right",
                        },
                      },
                      "RAM",
                    ),
                  ),
                ),
                /*#__PURE__*/ React.createElement(
                  "tbody",
                  null,
                  D.servers.slice(0, 5).map((s) =>
                    /*#__PURE__*/ React.createElement(
                      "tr",
                      {
                        key: s.id,
                      },
                      /*#__PURE__*/ React.createElement(
                        "td",
                        {
                          style: td,
                        },
                        /*#__PURE__*/ React.createElement(
                          "div",
                          {
                            style: {
                              fontWeight: 500,
                              color: "oklch(var(--foreground-900))",
                            },
                          },
                          s.name,
                        ),
                        /*#__PURE__*/ React.createElement(
                          "div",
                          {
                            style: {
                              fontSize: 10,
                              color: "oklch(var(--foreground-400))",
                            },
                          },
                          s.location,
                        ),
                      ),
                      /*#__PURE__*/ React.createElement(
                        "td",
                        {
                          style: td,
                        },
                        s.status === "running"
                          ? /*#__PURE__*/ React.createElement(
                              Badge,
                              {
                                tone: "accent",
                                size: "sm",
                                dot: true,
                              },
                              "\u041E\u043D\u043B\u0430\u0439\u043D",
                            )
                          : /*#__PURE__*/ React.createElement(
                              Badge,
                              {
                                tone: "secondary",
                                size: "sm",
                                dot: true,
                              },
                              "\u041E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D",
                            ),
                      ),
                      /*#__PURE__*/ React.createElement(
                        "td",
                        {
                          style: {
                            ...td,
                            textAlign: "right",
                            fontWeight: 500,
                            color: "oklch(var(--foreground-700))",
                          },
                        },
                        s.status === "running" ? s.cpuPct + "%" : "—",
                      ),
                      /*#__PURE__*/ React.createElement(
                        "td",
                        {
                          style: {
                            ...td,
                            textAlign: "right",
                            fontWeight: 500,
                            color: "oklch(var(--foreground-700))",
                          },
                        },
                        s.status === "running" ? s.ramPct + "%" : "—",
                      ),
                    ),
                  ),
                ),
              ),
            ),
            /*#__PURE__*/ React.createElement(
              Card,
              {
                title:
                  "\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 \u043E\u043F\u043E\u0432\u0435\u0449\u0435\u043D\u0438\u044F",
                icon: /*#__PURE__*/ React.createElement(IconTile, {
                  icon: "ri-alert-line",
                  tone: "secondary",
                  size: "sm",
                }),
                action: /*#__PURE__*/ React.createElement(WidgetLink, {
                  label:
                    "\u0412\u0441\u0435 \u043E\u043F\u043E\u0432\u0435\u0449\u0435\u043D\u0438\u044F",
                  onClick: () => onNavigate("alerts"),
                }),
              },
              /*#__PURE__*/ React.createElement(
                "div",
                {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  },
                },
                D.alerts.map((a) => {
                  const sev =
                    a.severity === "critical"
                      ? {
                          tone: "red",
                          icon: "ri-close-circle-fill",
                        }
                      : {
                          tone: "amber",
                          icon: "ri-alert-fill",
                        };
                  return /*#__PURE__*/ React.createElement(
                    "div",
                    {
                      key: a.id,
                      onClick: () => onNavigate("alerts"),
                      style: {
                        display: "flex",
                        gap: 12,
                        padding: "10px 12px",
                        borderRadius: "var(--radius-lg)",
                        cursor: "pointer",
                        background: "oklch(var(--background-100) / .6)",
                        borderLeft: `3px solid oklch(var(--${sev.tone === "red" ? "primary" : "amber"}-500))`,
                      },
                    },
                    /*#__PURE__*/ React.createElement(IconTile, {
                      icon: sev.icon,
                      tone: sev.tone,
                      size: "sm",
                    }),
                    /*#__PURE__*/ React.createElement(
                      "div",
                      {
                        style: {
                          minWidth: 0,
                          flex: 1,
                        },
                      },
                      /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          style: {
                            fontSize: 12,
                            fontWeight: 500,
                            color: "oklch(var(--foreground-900))",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          },
                        },
                        a.title,
                      ),
                      /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          style: {
                            display: "flex",
                            gap: 8,
                            marginTop: 2,
                            fontSize: 10,
                            color: "oklch(var(--foreground-500))",
                          },
                        },
                        /*#__PURE__*/ React.createElement(
                          "span",
                          null,
                          a.source,
                        ),
                        /*#__PURE__*/ React.createElement(
                          "span",
                          {
                            style: {
                              color: "oklch(var(--foreground-400))",
                            },
                          },
                          a.ago,
                        ),
                        /*#__PURE__*/ React.createElement(
                          "span",
                          {
                            style: {
                              color: `oklch(var(--${sev.tone === "red" ? "primary" : "amber"}-700))`,
                              fontWeight: 500,
                            },
                          },
                          "\u041D\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E",
                        ),
                      ),
                    ),
                  );
                }),
              ),
            ),
          ),
          /*#__PURE__*/ React.createElement(
            "div",
            {
              style: {
                marginTop: 20,
              },
            },
            /*#__PURE__*/ React.createElement(
              Card,
              {
                title:
                  "\u0421\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435 \u0434\u043E\u043C\u0435\u043D\u043E\u0432",
                icon: /*#__PURE__*/ React.createElement(IconTile, {
                  icon: "ri-global-line",
                  tone: "secondary",
                  size: "sm",
                }),
                action: /*#__PURE__*/ React.createElement(WidgetLink, {
                  label:
                    "\u0412\u0441\u0435 \u0434\u043E\u043C\u0435\u043D\u044B",
                  onClick: () => onNavigate("domains"),
                }),
              },
              /*#__PURE__*/ React.createElement(
                "div",
                {
                  style: {
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: 8,
                  },
                },
                D.domains.map((d) => {
                  const cfg =
                    d.health === "good"
                      ? {
                          tone: "accent",
                        }
                      : d.health === "warning"
                        ? {
                            tone: "amber",
                          }
                        : {
                            tone: "red",
                          };
                  return /*#__PURE__*/ React.createElement(
                    "div",
                    {
                      key: d.id,
                      onClick: () => onNavigate("domains"),
                      style: {
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 12px",
                        borderRadius: "var(--radius-lg)",
                        cursor: "pointer",
                      },
                      onMouseEnter: (e) =>
                        (e.currentTarget.style.background =
                          "oklch(var(--background-100) / .5)"),
                      onMouseLeave: (e) =>
                        (e.currentTarget.style.background = "transparent"),
                    },
                    /*#__PURE__*/ React.createElement(IconTile, {
                      icon: "ri-global-line",
                      tone: "secondary",
                      size: "sm",
                    }),
                    /*#__PURE__*/ React.createElement(
                      "div",
                      {
                        style: {
                          minWidth: 0,
                          flex: 1,
                        },
                      },
                      /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          style: {
                            fontSize: 12,
                            fontWeight: 500,
                            color: "oklch(var(--foreground-900))",
                          },
                        },
                        d.name,
                      ),
                      /*#__PURE__*/ React.createElement(
                        "div",
                        {
                          style: {
                            fontSize: 10,
                            color: "oklch(var(--foreground-400))",
                          },
                        },
                        d.provider,
                        " \xB7 ",
                        d.registrar,
                      ),
                    ),
                    /*#__PURE__*/ React.createElement(
                      Badge,
                      {
                        tone: cfg.tone,
                        size: "sm",
                        dot: true,
                      },
                      d.label,
                    ),
                  );
                }),
              ),
            ),
          ),
        );
      }
      window.DashboardScreen = DashboardScreen;
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: "ui_kits/inspot/DashboardScreen.jsx",
      error: String((e && e.message) || e),
    });
  }

  // ui_kits/inspot/LoginScreen.jsx
  try {
    (() => {
      // Login screen + placeholder for screens not included in this kit.
      const { Input, Button, EmptyState } = window.InspotDesignSystem_abeb6a;
      function LoginScreen({ onLogin }) {
        const [user, setUser] = React.useState("admin");
        const [pw, setPw] = React.useState("demo1234");
        const [show, setShow] = React.useState(false);
        return /*#__PURE__*/ React.createElement(
          "div",
          {
            style: {
              minHeight: "100vh",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "oklch(var(--background-50))",
              padding: 16,
            },
          },
          /*#__PURE__*/ React.createElement(
            "div",
            {
              style: {
                width: "100%",
                maxWidth: 360,
              },
            },
            /*#__PURE__*/ React.createElement(
              "div",
              {
                style: {
                  textAlign: "center",
                  marginBottom: 32,
                },
              },
              /*#__PURE__*/ React.createElement(
                "h1",
                {
                  style: {
                    fontFamily: "var(--font-heading)",
                    fontSize: 26,
                    fontWeight: 700,
                    color: "oklch(var(--foreground-900))",
                    margin: 0,
                  },
                },
                "Inspot",
              ),
              /*#__PURE__*/ React.createElement(
                "p",
                {
                  style: {
                    fontSize: 14,
                    color: "oklch(var(--foreground-500))",
                    margin: "4px 0 0",
                  },
                },
                "\u041F\u0430\u043D\u0435\u043B\u044C \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F",
              ),
            ),
            /*#__PURE__*/ React.createElement(
              "form",
              {
                onSubmit: (e) => {
                  e.preventDefault();
                  onLogin();
                },
                style: {
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                },
              },
              /*#__PURE__*/ React.createElement(Input, {
                label:
                  "\u0418\u043C\u044F \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F",
                value: user,
                onChange: (e) => setUser(e.target.value),
                placeholder: "admin",
              }),
              /*#__PURE__*/ React.createElement(Input, {
                label: "\u041F\u0430\u0440\u043E\u043B\u044C",
                type: show ? "text" : "password",
                value: pw,
                onChange: (e) => setPw(e.target.value),
                trailingIcon: show ? "ri-eye-off-line" : "ri-eye-line",
                onTrailingClick: () => setShow(!show),
              }),
              /*#__PURE__*/ React.createElement(
                Button,
                {
                  variant: "primary",
                  size: "lg",
                  block: true,
                  type: "submit",
                },
                "\u0412\u043E\u0439\u0442\u0438",
              ),
            ),
          ),
        );
      }
      function PlaceholderScreen({ title }) {
        return /*#__PURE__*/ React.createElement(
          "div",
          {
            style: {
              minHeight: "calc(100vh - 56px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
            },
          },
          /*#__PURE__*/ React.createElement(EmptyState, {
            icon: "ri-layout-grid-line",
            tone: "secondary",
            title: title,
            description:
              "\u042D\u043A\u0440\u0430\u043D \u043D\u0435 \u0432\u043A\u043B\u044E\u0447\u0451\u043D \u0432 \u044D\u0442\u043E\u0442 UI-kit. \u0414\u0430\u0448\u0431\u043E\u0440\u0434, \u0421\u0435\u0440\u0432\u0435\u0440\u044B, \u041B\u043E\u0433\u0438 \u0438 \u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u2014 \u043F\u043E\u043B\u043D\u043E\u0441\u0442\u044C\u044E \u0438\u043D\u0442\u0435\u0440\u0430\u043A\u0442\u0438\u0432\u043D\u044B.",
          }),
        );
      }
      window.LoginScreen = LoginScreen;
      window.PlaceholderScreen = PlaceholderScreen;
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: "ui_kits/inspot/LoginScreen.jsx",
      error: String((e && e.message) || e),
    });
  }

  // ui_kits/inspot/LogsScreen.jsx
  try {
    (() => {
      // Logs screen — filter bar + table with expandable detail.
      const {
        Input,
        Badge,
        IconTile,
        SegmentedControl,
        Dropdown,
        DropdownItem,
        Button,
        Toast,
      } = window.InspotDesignSystem_abeb6a;
      function LogsScreen() {
        const D = window.INSPOT_DATA;
        const [q, setQ] = React.useState("");
        const [level, setLevel] = React.useState("");
        const [expanded, setExpanded] = React.useState(null);
        const [toast, setToast] = React.useState(false);
        React.useEffect(() => {
          if (toast) {
            const t = setTimeout(() => setToast(false), 2500);
            return () => clearTimeout(t);
          }
        }, [toast]);
        const filtered = D.logs.filter(
          (l) =>
            (!level || l.level === level) &&
            (!q ||
              (l.message + l.source + l.service)
                .toLowerCase()
                .includes(q.toLowerCase())),
        );
        const counts = {};
        filtered.forEach((l) => {
          counts[l.level] = (counts[l.level] || 0) + 1;
        });
        const th = {
          textAlign: "left",
          padding: "10px 16px",
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: ".04em",
          color: "oklch(var(--foreground-500))",
          background: "oklch(var(--background-100) / .7)",
        };
        return /*#__PURE__*/ React.createElement(
          "div",
          {
            style: {
              padding: 24,
            },
          },
          toast &&
            /*#__PURE__*/ React.createElement(
              Toast,
              {
                variant: "success",
              },
              "\u0421\u043A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u043D\u043E \u0432 \u0431\u0443\u0444\u0435\u0440 \u043E\u0431\u043C\u0435\u043D\u0430",
            ),
          /*#__PURE__*/ React.createElement(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 20,
                flexWrap: "wrap",
              },
            },
            /*#__PURE__*/ React.createElement(
              "span",
              {
                style: {
                  fontSize: 12,
                  color: "oklch(var(--foreground-500))",
                },
              },
              /*#__PURE__*/ React.createElement(
                "b",
                {
                  style: {
                    color: "oklch(var(--foreground-700))",
                  },
                },
                filtered.length,
              ),
              " \u0437\u0430\u043F\u0438\u0441\u0435\u0439",
            ),
            Object.keys(counts).map((lv) =>
              /*#__PURE__*/ React.createElement(
                Badge,
                {
                  key: lv,
                  tone: D.levels[lv].tone,
                  size: "sm",
                },
                D.levels[lv].label,
                " ",
                counts[lv],
              ),
            ),
            /*#__PURE__*/ React.createElement(
              "div",
              {
                style: {
                  marginLeft: "auto",
                },
              },
              /*#__PURE__*/ React.createElement(
                Button,
                {
                  variant: "ghost",
                  size: "sm",
                  icon: "ri-refresh-line",
                },
                "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C",
              ),
            ),
          ),
          /*#__PURE__*/ React.createElement(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 20,
              },
            },
            /*#__PURE__*/ React.createElement(
              "div",
              {
                style: {
                  flex: 1,
                  maxWidth: 360,
                },
              },
              /*#__PURE__*/ React.createElement(Input, {
                leadingIcon: "ri-search-line",
                placeholder:
                  "\u041F\u043E\u0438\u0441\u043A \u043F\u043E \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044E, \u0438\u0441\u0442\u043E\u0447\u043D\u0438\u043A\u0443\u2026",
                value: q,
                onChange: (e) => setQ(e.target.value),
              }),
            ),
            /*#__PURE__*/ React.createElement(
              Dropdown,
              {
                align: "left",
                trigger: /*#__PURE__*/ React.createElement(
                  Button,
                  {
                    variant: "secondary",
                    size: "md",
                    icon: "ri-filter-3-line",
                    iconRight: "ri-arrow-down-s-line",
                  },
                  level ? D.levels[level].label : "Уровень",
                ),
              },
              /*#__PURE__*/ React.createElement(
                DropdownItem,
                {
                  active: !level,
                  onClick: () => setLevel(""),
                },
                "\u0412\u0441\u0435 \u0443\u0440\u043E\u0432\u043D\u0438",
              ),
              Object.keys(D.levels).map((lv) =>
                /*#__PURE__*/ React.createElement(
                  DropdownItem,
                  {
                    key: lv,
                    icon: D.levels[lv].icon,
                    active: level === lv,
                    onClick: () => setLevel(lv),
                  },
                  D.levels[lv].label,
                ),
              ),
            ),
          ),
          /*#__PURE__*/ React.createElement(
            "div",
            {
              style: {
                border: "1px solid oklch(var(--background-200))",
                borderRadius: "var(--radius-xl)",
                overflow: "hidden",
              },
            },
            /*#__PURE__*/ React.createElement(
              "table",
              {
                style: {
                  width: "100%",
                  borderCollapse: "collapse",
                },
              },
              /*#__PURE__*/ React.createElement(
                "thead",
                null,
                /*#__PURE__*/ React.createElement(
                  "tr",
                  null,
                  /*#__PURE__*/ React.createElement(
                    "th",
                    {
                      style: {
                        ...th,
                        width: 90,
                      },
                    },
                    "\u0412\u0440\u0435\u043C\u044F",
                  ),
                  /*#__PURE__*/ React.createElement(
                    "th",
                    {
                      style: {
                        ...th,
                        width: 100,
                      },
                    },
                    "\u0423\u0440\u043E\u0432\u0435\u043D\u044C",
                  ),
                  /*#__PURE__*/ React.createElement(
                    "th",
                    {
                      style: {
                        ...th,
                        width: 130,
                      },
                    },
                    "\u0418\u0441\u0442\u043E\u0447\u043D\u0438\u043A",
                  ),
                  /*#__PURE__*/ React.createElement(
                    "th",
                    {
                      style: th,
                    },
                    "\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435",
                  ),
                  /*#__PURE__*/ React.createElement("th", {
                    style: {
                      ...th,
                      width: 44,
                    },
                  }),
                ),
              ),
              /*#__PURE__*/ React.createElement(
                "tbody",
                null,
                filtered.map((l) => {
                  const open = expanded === l.id;
                  const lv = D.levels[l.level];
                  return /*#__PURE__*/ React.createElement(
                    React.Fragment,
                    {
                      key: l.id,
                    },
                    /*#__PURE__*/ React.createElement(
                      "tr",
                      {
                        style: {
                          borderTop: "1px solid oklch(var(--background-100))",
                          background: open
                            ? "oklch(var(--background-100) / .5)"
                            : "transparent",
                          cursor: "pointer",
                        },
                        onClick: () => setExpanded(open ? null : l.id),
                      },
                      /*#__PURE__*/ React.createElement(
                        "td",
                        {
                          style: {
                            padding: "12px 16px",
                            fontSize: 12,
                            color: "oklch(var(--foreground-500))",
                            fontFamily: "var(--font-mono)",
                          },
                        },
                        l.ts,
                      ),
                      /*#__PURE__*/ React.createElement(
                        "td",
                        {
                          style: {
                            padding: "12px 16px",
                          },
                        },
                        /*#__PURE__*/ React.createElement(
                          Badge,
                          {
                            tone: lv.tone,
                            size: "sm",
                            icon: lv.icon,
                          },
                          lv.label,
                        ),
                      ),
                      /*#__PURE__*/ React.createElement(
                        "td",
                        {
                          style: {
                            padding: "12px 16px",
                            fontSize: 12,
                            fontWeight: 500,
                            color: "oklch(var(--foreground-700))",
                          },
                        },
                        l.source,
                        /*#__PURE__*/ React.createElement(
                          "div",
                          {
                            style: {
                              fontSize: 10,
                              color: "oklch(var(--foreground-400))",
                              textTransform: "uppercase",
                            },
                          },
                          l.service,
                        ),
                      ),
                      /*#__PURE__*/ React.createElement(
                        "td",
                        {
                          style: {
                            padding: "12px 16px",
                            fontSize: 13,
                            color: "oklch(var(--foreground-800))",
                            maxWidth: 460,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: open ? "normal" : "nowrap",
                          },
                        },
                        l.message,
                      ),
                      /*#__PURE__*/ React.createElement(
                        "td",
                        {
                          style: {
                            padding: "12px 16px",
                            color: "oklch(var(--foreground-400))",
                          },
                        },
                        /*#__PURE__*/ React.createElement("i", {
                          className: open
                            ? "ri-arrow-up-s-line"
                            : "ri-arrow-down-s-line",
                        }),
                      ),
                    ),
                    open &&
                      /*#__PURE__*/ React.createElement(
                        "tr",
                        {
                          style: {
                            background: "oklch(var(--background-100) / .4)",
                          },
                        },
                        /*#__PURE__*/ React.createElement(
                          "td",
                          {
                            colSpan: 5,
                            style: {
                              padding: "4px 16px 16px",
                            },
                          },
                          /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              style: {
                                border:
                                  "1px solid oklch(var(--background-200))",
                                borderRadius: "var(--radius-lg)",
                                background: "oklch(var(--background-50))",
                                padding: 12,
                              },
                            },
                            /*#__PURE__*/ React.createElement(
                              "pre",
                              {
                                style: {
                                  margin: 0,
                                  fontFamily: "var(--font-mono)",
                                  fontSize: 11,
                                  color: "oklch(var(--foreground-600))",
                                  whiteSpace: "pre-wrap",
                                  lineHeight: 1.55,
                                },
                              },
                              l.details,
                            ),
                          ),
                          /*#__PURE__*/ React.createElement(
                            "div",
                            {
                              style: {
                                marginTop: 10,
                              },
                            },
                            /*#__PURE__*/ React.createElement(
                              Button,
                              {
                                variant: "ghost",
                                size: "sm",
                                icon: "ri-file-copy-line",
                                onClick: (e) => {
                                  e.stopPropagation();
                                  setToast(true);
                                },
                              },
                              "\u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C",
                            ),
                          ),
                        ),
                      ),
                  );
                }),
              ),
            ),
          ),
        );
      }
      window.LogsScreen = LogsScreen;
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: "ui_kits/inspot/LogsScreen.jsx",
      error: String((e && e.message) || e),
    });
  }

  // ui_kits/inspot/ServersScreen.jsx
  try {
    (() => {
      // Servers screen — grid of server cards with power actions + confirm modal.
      const { Card, IconTile, Badge, Button, Modal, Toast, ProgressBar } =
        window.InspotDesignSystem_abeb6a;
      function ServerCard({ s, onAction }) {
        const running = s.status === "running";
        const row = (label, value) =>
          /*#__PURE__*/ React.createElement(
            "div",
            {
              style: {
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12,
              },
            },
            /*#__PURE__*/ React.createElement(
              "span",
              {
                style: {
                  color: "oklch(var(--foreground-500))",
                },
              },
              label,
            ),
            /*#__PURE__*/ React.createElement(
              "span",
              {
                style: {
                  color: "oklch(var(--foreground-800))",
                  fontWeight: 500,
                  fontFamily: label === "IP" ? "var(--font-mono)" : "inherit",
                },
              },
              value,
            ),
          );
        return /*#__PURE__*/ React.createElement(
          Card,
          {
            padding: "none",
            hover: true,
          },
          /*#__PURE__*/ React.createElement(
            "div",
            {
              style: {
                padding: "14px 16px",
                borderBottom: "1px solid oklch(var(--background-100))",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              },
            },
            /*#__PURE__*/ React.createElement(
              "div",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  minWidth: 0,
                },
              },
              /*#__PURE__*/ React.createElement(IconTile, {
                icon: "ri-server-line",
                tone: "secondary",
                size: "lg",
              }),
              /*#__PURE__*/ React.createElement(
                "div",
                {
                  style: {
                    minWidth: 0,
                  },
                },
                /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    style: {
                      fontFamily: "var(--font-heading)",
                      fontSize: 14,
                      fontWeight: 600,
                      color: "oklch(var(--foreground-900))",
                    },
                  },
                  s.name,
                ),
                /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    style: {
                      fontSize: 12,
                      color: "oklch(var(--foreground-500))",
                      fontFamily: "var(--font-mono)",
                    },
                  },
                  s.ip,
                ),
              ),
            ),
            running
              ? /*#__PURE__*/ React.createElement(
                  Badge,
                  {
                    tone: "accent",
                    dot: true,
                  },
                  "Running",
                )
              : /*#__PURE__*/ React.createElement(
                  Badge,
                  {
                    tone: "secondary",
                    dot: true,
                  },
                  "Stopped",
                ),
          ),
          /*#__PURE__*/ React.createElement(
            "div",
            {
              style: {
                padding: "12px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              },
            },
            row("CPU", s.cpu),
            row("RAM", s.ram),
            row("Disk", s.disk),
            row("OS", s.os),
            row("Location", s.location),
          ),
          /*#__PURE__*/ React.createElement(
            "div",
            {
              style: {
                padding: "12px 16px",
                borderTop: "1px solid oklch(var(--background-100))",
                display: "flex",
                gap: 8,
              },
            },
            running
              ? /*#__PURE__*/ React.createElement(
                  React.Fragment,
                  null,
                  /*#__PURE__*/ React.createElement(
                    Button,
                    {
                      variant: "secondary",
                      size: "sm",
                      icon: "ri-stop-circle-line",
                      onClick: () => onAction(s, "stop"),
                    },
                    "Stop",
                  ),
                  /*#__PURE__*/ React.createElement(
                    Button,
                    {
                      variant: "secondary",
                      size: "sm",
                      icon: "ri-restart-line",
                      onClick: () => onAction(s, "restart"),
                    },
                    "Restart",
                  ),
                )
              : /*#__PURE__*/ React.createElement(
                  Button,
                  {
                    variant: "secondary",
                    size: "sm",
                    icon: "ri-play-circle-line",
                    onClick: () => onAction(s, "start"),
                  },
                  "Start",
                ),
          ),
        );
      }
      function ServersScreen() {
        const D = window.INSPOT_DATA;
        const [pending, setPending] = React.useState(null); // {server, action}
        const [toast, setToast] = React.useState(null);
        React.useEffect(() => {
          if (toast) {
            const t = setTimeout(() => setToast(null), 3000);
            return () => clearTimeout(t);
          }
        }, [toast]);
        const ACT = {
          start: "запущен",
          stop: "остановлен",
          restart: "перезагружен",
        };
        const confirm = () => {
          setToast(`Сервер «${pending.server.name}» ${ACT[pending.action]}.`);
          setPending(null);
        };
        return /*#__PURE__*/ React.createElement(
          "div",
          {
            style: {
              padding: 24,
            },
          },
          toast &&
            /*#__PURE__*/ React.createElement(
              Toast,
              {
                variant: "success",
              },
              toast,
            ),
          /*#__PURE__*/ React.createElement(
            "div",
            {
              style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 20,
              },
            },
            /*#__PURE__*/ React.createElement(
              "p",
              {
                style: {
                  fontSize: 12,
                  color: "oklch(var(--foreground-500))",
                  margin: 0,
                },
              },
              D.servers.length,
              " \u0441\u0435\u0440\u0432\u0435\u0440\u043E\u0432 \xB7 Hetzner",
            ),
            /*#__PURE__*/ React.createElement(
              Button,
              {
                variant: "ghost",
                size: "sm",
                icon: "ri-refresh-line",
              },
              "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C",
            ),
          ),
          /*#__PURE__*/ React.createElement(
            "div",
            {
              style: {
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 16,
              },
            },
            D.servers.map((s) =>
              /*#__PURE__*/ React.createElement(ServerCard, {
                key: s.id,
                s: s,
                onAction: (server, action) =>
                  setPending({
                    server,
                    action,
                  }),
              }),
            ),
          ),
          /*#__PURE__*/ React.createElement(
            Modal,
            {
              open: !!pending,
              onClose: () => setPending(null),
              title: pending
                ? {
                    start: "Запустить сервер",
                    stop: "Остановить сервер",
                    restart: "Перезагрузить сервер",
                  }[pending.action]
                : "",
              footer: /*#__PURE__*/ React.createElement(
                React.Fragment,
                null,
                /*#__PURE__*/ React.createElement(
                  Button,
                  {
                    variant: "ghost",
                    onClick: () => setPending(null),
                  },
                  "\u041E\u0442\u043C\u0435\u043D\u0430",
                ),
                /*#__PURE__*/ React.createElement(
                  Button,
                  {
                    variant: "primary",
                    onClick: confirm,
                  },
                  "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C",
                ),
              ),
            },
            pending &&
              `Сервер «${pending.server.name}» будет ${
                {
                  start: "запущен",
                  stop: "остановлен",
                  restart: "перезагружен",
                }[pending.action]
              }. Возможна кратковременная недоступность сервисов.`,
          ),
        );
      }
      window.ServersScreen = ServersScreen;
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: "ui_kits/inspot/ServersScreen.jsx",
      error: String((e && e.message) || e),
    });
  }

  // ui_kits/inspot/SettingsScreen.jsx
  try {
    (() => {
      // Settings screen — tabbed (underline), appearance controls.
      const { SegmentedControl, Card, Switch, Button, Input, Toast, IconTile } =
        window.InspotDesignSystem_abeb6a;
      function SettingsScreen({ dark, onToggleTheme }) {
        const [tab, setTab] = React.useState("appearance");
        const [compact, setCompact] = React.useState(false);
        const [timestamps, setTimestamps] = React.useState(true);
        const [mono, setMono] = React.useState(true);
        const [autoRefresh, setAutoRefresh] = React.useState(true);
        const [interval, setIntervalV] = React.useState("30");
        const [toast, setToast] = React.useState(false);
        React.useEffect(() => {
          if (toast) {
            const t = setTimeout(() => setToast(false), 2500);
            return () => clearTimeout(t);
          }
        }, [toast]);
        const tabs = [
          {
            value: "profile",
            label: "Профиль",
            icon: "ri-user-line",
          },
          {
            value: "notifications",
            label: "Уведомления",
            icon: "ri-notification-3-line",
          },
          {
            value: "appearance",
            label: "Оформление",
            icon: "ri-palette-line",
          },
          {
            value: "security",
            label: "Безопасность",
            icon: "ri-shield-check-line",
          },
        ];
        const themeCard = (val, label, desc, icon) => {
          const active = (val === "dark") === dark && val !== "system";
          return /*#__PURE__*/ React.createElement(
            "button",
            {
              onClick: () => {
                if ((val === "dark") !== dark) onToggleTheme();
              },
              style: {
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                padding: 16,
                borderRadius: "var(--radius-xl)",
                cursor: "pointer",
                textAlign: "center",
                border: `1px solid oklch(var(--${active ? "primary-300" : "background-200"}))`,
                background: active
                  ? "oklch(var(--primary-50) / .5)"
                  : "transparent",
              },
            },
            /*#__PURE__*/ React.createElement(
              "span",
              {
                style: {
                  width: 40,
                  height: 40,
                  borderRadius: 9999,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  background: `oklch(var(--${active ? "primary-100" : "secondary-100"}))`,
                  color: `oklch(var(--${active ? "primary-600" : "secondary-600"}))`,
                },
              },
              /*#__PURE__*/ React.createElement("i", {
                className: icon,
              }),
            ),
            /*#__PURE__*/ React.createElement(
              "span",
              {
                style: {
                  fontSize: 14,
                  fontWeight: 500,
                  color: "oklch(var(--foreground-800))",
                },
              },
              label,
            ),
            /*#__PURE__*/ React.createElement(
              "span",
              {
                style: {
                  fontSize: 10,
                  color: "oklch(var(--foreground-400))",
                  lineHeight: 1.3,
                },
              },
              desc,
            ),
          );
        };
        const intervals = [
          {
            value: "10",
            label: "10 секунд",
          },
          {
            value: "30",
            label: "30 секунд",
          },
          {
            value: "60",
            label: "1 минута",
          },
          {
            value: "300",
            label: "5 минут",
          },
        ];
        return /*#__PURE__*/ React.createElement(
          "div",
          {
            style: {
              padding: 24,
            },
          },
          toast &&
            /*#__PURE__*/ React.createElement(
              Toast,
              {
                variant: "success",
              },
              "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u043E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u0438\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u044B",
            ),
          /*#__PURE__*/ React.createElement(
            "div",
            {
              style: {
                marginBottom: 28,
              },
            },
            /*#__PURE__*/ React.createElement(SegmentedControl, {
              variant: "underline",
              value: tab,
              onChange: setTab,
              options: tabs,
            }),
          ),
          tab === "appearance" &&
            /*#__PURE__*/ React.createElement(
              "div",
              {
                style: {
                  maxWidth: 640,
                  display: "flex",
                  flexDirection: "column",
                  gap: 20,
                },
              },
              /*#__PURE__*/ React.createElement(
                Card,
                {
                  padding: "md",
                },
                /*#__PURE__*/ React.createElement(
                  "h4",
                  {
                    style: {
                      fontFamily: "var(--font-heading)",
                      fontSize: 14,
                      fontWeight: 600,
                      color: "oklch(var(--foreground-900))",
                      margin: "0 0 16px",
                    },
                  },
                  "\u0422\u0435\u043C\u0430 \u043E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u0438\u044F",
                ),
                /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    style: {
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: 12,
                    },
                  },
                  themeCard(
                    "system",
                    "Системная",
                    "По настройкам ОС",
                    "ri-contrast-2-line",
                  ),
                  themeCard(
                    "light",
                    "Светлая",
                    "Всегда светлая тема",
                    "ri-sun-line",
                  ),
                  themeCard(
                    "dark",
                    "Тёмная",
                    "Всегда тёмная тема",
                    "ri-moon-line",
                  ),
                ),
              ),
              /*#__PURE__*/ React.createElement(
                Card,
                {
                  padding: "md",
                },
                /*#__PURE__*/ React.createElement(
                  "h4",
                  {
                    style: {
                      fontFamily: "var(--font-heading)",
                      fontSize: 14,
                      fontWeight: 600,
                      color: "oklch(var(--foreground-900))",
                      margin: "0 0 12px",
                    },
                  },
                  "\u0418\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441",
                ),
                /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    },
                  },
                  [
                    [
                      "Компактный режим",
                      "Уменьшенные отступы и размеры",
                      compact,
                      setCompact,
                    ],
                    [
                      "Метки времени",
                      "Показывать относительное время",
                      timestamps,
                      setTimestamps,
                    ],
                    [
                      "Моноширинные шрифты",
                      "Мон-шрифт в логах и деталях",
                      mono,
                      setMono,
                    ],
                  ].map(([t, d, v, set]) =>
                    /*#__PURE__*/ React.createElement(
                      "div",
                      {
                        key: t,
                        style: {
                          padding: "10px 12px",
                          borderRadius: "var(--radius-lg)",
                        },
                      },
                      /*#__PURE__*/ React.createElement(Switch, {
                        label: t,
                        description: d,
                        checked: v,
                        onChange: set,
                      }),
                    ),
                  ),
                ),
              ),
              /*#__PURE__*/ React.createElement(
                Card,
                {
                  padding: "md",
                },
                /*#__PURE__*/ React.createElement(Switch, {
                  label:
                    "\u0410\u0432\u0442\u043E\u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u0435",
                  description:
                    "\u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u043E\u0431\u043D\u043E\u0432\u043B\u044F\u0442\u044C \u0434\u0430\u043D\u043D\u044B\u0435 \u043D\u0430 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0430\u0445",
                  checked: autoRefresh,
                  onChange: setAutoRefresh,
                }),
                autoRefresh &&
                  /*#__PURE__*/ React.createElement(
                    "div",
                    {
                      style: {
                        marginTop: 16,
                        paddingTop: 16,
                        borderTop: "1px solid oklch(var(--background-100))",
                      },
                    },
                    /*#__PURE__*/ React.createElement(
                      "div",
                      {
                        style: {
                          fontSize: 12,
                          fontWeight: 500,
                          color: "oklch(var(--foreground-500))",
                          marginBottom: 10,
                        },
                      },
                      "\u0418\u043D\u0442\u0435\u0440\u0432\u0430\u043B \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u0438\u044F",
                    ),
                    /*#__PURE__*/ React.createElement(SegmentedControl, {
                      variant: "pill",
                      value: interval,
                      onChange: setIntervalV,
                      options: intervals,
                    }),
                  ),
              ),
              /*#__PURE__*/ React.createElement(
                "div",
                null,
                /*#__PURE__*/ React.createElement(
                  Button,
                  {
                    variant: "primary",
                    icon: "ri-check-line",
                    onClick: () => setToast(true),
                  },
                  "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F",
                ),
              ),
            ),
          tab === "profile" &&
            /*#__PURE__*/ React.createElement(
              "div",
              {
                style: {
                  maxWidth: 520,
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                },
              },
              /*#__PURE__*/ React.createElement(
                Card,
                {
                  padding: "md",
                },
                /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      marginBottom: 20,
                    },
                  },
                  /*#__PURE__*/ React.createElement(
                    "span",
                    {
                      style: {
                        width: 56,
                        height: 56,
                        borderRadius: 9999,
                        background: "oklch(var(--primary-100))",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 22,
                        fontWeight: 700,
                        color: "oklch(var(--primary-700))",
                        fontFamily: "var(--font-heading)",
                      },
                    },
                    "A",
                  ),
                  /*#__PURE__*/ React.createElement(
                    "div",
                    null,
                    /*#__PURE__*/ React.createElement(
                      "div",
                      {
                        style: {
                          fontSize: 16,
                          fontWeight: 600,
                          color: "oklch(var(--foreground-900))",
                        },
                      },
                      "admin",
                    ),
                    /*#__PURE__*/ React.createElement(
                      "div",
                      {
                        style: {
                          fontSize: 12,
                          color: "oklch(var(--foreground-500))",
                        },
                      },
                      "\u041E\u043F\u0435\u0440\u0430\u0442\u043E\u0440 \xB7 admin@inspot.app",
                    ),
                  ),
                ),
                /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      gap: 14,
                    },
                  },
                  /*#__PURE__*/ React.createElement(Input, {
                    label:
                      "\u0418\u043C\u044F \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F",
                    defaultValue: "admin",
                  }),
                  /*#__PURE__*/ React.createElement(Input, {
                    label: "Email",
                    defaultValue: "admin@inspot.app",
                  }),
                ),
              ),
              /*#__PURE__*/ React.createElement(
                "div",
                null,
                /*#__PURE__*/ React.createElement(
                  Button,
                  {
                    variant: "primary",
                    icon: "ri-check-line",
                    onClick: () => setToast(true),
                  },
                  "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C",
                ),
              ),
            ),
          (tab === "notifications" || tab === "security") &&
            /*#__PURE__*/ React.createElement(
              "div",
              {
                style: {
                  maxWidth: 520,
                },
              },
              /*#__PURE__*/ React.createElement(
                Card,
                {
                  padding: "md",
                },
                /*#__PURE__*/ React.createElement(
                  "div",
                  {
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    },
                  },
                  /*#__PURE__*/ React.createElement(Switch, {
                    label:
                      tab === "security"
                        ? "Двухфакторная аутентификация"
                        : "Email-уведомления",
                    description:
                      tab === "security"
                        ? "Требовать код при входе"
                        : "Присылать оповещения на почту",
                    checked: true,
                    onChange: () => {},
                  }),
                  /*#__PURE__*/ React.createElement(Switch, {
                    label:
                      tab === "security"
                        ? "Сессии на всех устройствах"
                        : "Критические оповещения",
                    description:
                      tab === "security"
                        ? "Выходить со всех сессий при смене пароля"
                        : "Мгновенные push при сбоях",
                    checked: false,
                    onChange: () => {},
                  }),
                ),
              ),
            ),
        );
      }
      window.SettingsScreen = SettingsScreen;
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: "ui_kits/inspot/SettingsScreen.jsx",
      error: String((e && e.message) || e),
    });
  }

  // ui_kits/inspot/Shell.jsx
  try {
    (() => {
      // Inspot app shell: sidebar + topbar. Composes DS components.
      const { IconButton, Dropdown, DropdownItem, DropdownSep, DropdownLabel } =
        window.InspotDesignSystem_abeb6a;
      const D = window.INSPOT_DATA;
      const TITLES = {
        dashboard: "Дашборд",
        servers: "Серверы",
        domains: "Домены",
        monitoring: "Мониторинг",
        backups: "Бэкапы",
        mail: "Почта",
        logs: "Логи",
        alerts: "Оповещения",
        settings: "Настройки",
      };
      function Shell({
        current,
        onNavigate,
        dark,
        onToggleTheme,
        onLogout,
        children,
      }) {
        const [collapsed, setCollapsed] = React.useState(false);
        const w = collapsed ? 64 : 256;
        const unackCount = D.alerts.filter((a) => !a.ack).length;
        const navItem = (item) => {
          const active = current === item.path;
          return /*#__PURE__*/ React.createElement(
            "button",
            {
              key: item.path,
              onClick: () => onNavigate(item.path),
              title: item.label,
              style: {
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                border: "none",
                cursor: "pointer",
                justifyContent: collapsed ? "center" : "flex-start",
                padding: collapsed ? "10px 8px" : "10px 12px",
                borderRadius: "var(--radius-lg)",
                fontFamily: "var(--font-body)",
                fontSize: 14,
                fontWeight: 500,
                whiteSpace: "nowrap",
                background: active
                  ? "oklch(var(--primary-100))"
                  : "transparent",
                color: active
                  ? "oklch(var(--primary-700))"
                  : "oklch(var(--foreground-600))",
                transition: "background-color .2s, color .2s",
              },
              onMouseEnter: (e) => {
                if (!active) {
                  e.currentTarget.style.background =
                    "oklch(var(--background-100))";
                  e.currentTarget.style.color = "oklch(var(--foreground-900))";
                }
              },
              onMouseLeave: (e) => {
                if (!active) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "oklch(var(--foreground-600))";
                }
              },
            },
            /*#__PURE__*/ React.createElement("i", {
              className: item.icon,
              style: {
                fontSize: 18,
                display: "flex",
              },
            }),
            !collapsed &&
              /*#__PURE__*/ React.createElement("span", null, item.label),
            !collapsed &&
              item.path === "alerts" &&
              unackCount > 0 &&
              /*#__PURE__*/ React.createElement(
                "span",
                {
                  style: {
                    marginLeft: "auto",
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "1px 7px",
                    borderRadius: 9999,
                    background: "oklch(var(--primary-500))",
                    color: "oklch(var(--background-50))",
                  },
                },
                unackCount,
              ),
          );
        };
        return /*#__PURE__*/ React.createElement(
          "div",
          {
            style: {
              minHeight: "100%",
              display: "flex",
              background: "oklch(var(--background-50))",
            },
          },
          /*#__PURE__*/ React.createElement(
            "aside",
            {
              style: {
                width: w,
                flexShrink: 0,
                borderRight: "1px solid oklch(var(--background-200))",
                display: "flex",
                flexDirection: "column",
                transition: "width .2s",
                position: "sticky",
                top: 0,
                height: "100vh",
              },
            },
            /*#__PURE__*/ React.createElement(
              "div",
              {
                style: {
                  height: 56,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: collapsed ? "center" : "flex-start",
                  padding: collapsed ? 0 : "0 16px",
                  borderBottom: "1px solid oklch(var(--background-200))",
                },
              },
              collapsed
                ? /*#__PURE__*/ React.createElement(
                    "span",
                    {
                      style: {
                        width: 32,
                        height: 32,
                        borderRadius: "var(--radius-md)",
                        background: "oklch(var(--primary-100))",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: "var(--font-heading)",
                        fontSize: 14,
                        fontWeight: 700,
                        color: "oklch(var(--primary-700))",
                      },
                    },
                    "In",
                  )
                : /*#__PURE__*/ React.createElement(
                    "span",
                    {
                      style: {
                        fontFamily: "var(--font-heading)",
                        fontSize: 18,
                        fontWeight: 700,
                        color: "oklch(var(--foreground-900))",
                        letterSpacing: "-0.01em",
                      },
                    },
                    "Inspot",
                  ),
            ),
            /*#__PURE__*/ React.createElement(
              "nav",
              {
                style: {
                  flex: 1,
                  overflowY: "auto",
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                },
              },
              D.nav.map(navItem),
            ),
            /*#__PURE__*/ React.createElement(
              "div",
              {
                style: {
                  padding: 12,
                  borderTop: "1px solid oklch(var(--background-200))",
                },
              },
              navItem({
                path: "settings",
                label: "Настройки",
                icon: "ri-settings-4-line",
              }),
            ),
          ),
          /*#__PURE__*/ React.createElement(
            "div",
            {
              style: {
                flex: 1,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
              },
            },
            /*#__PURE__*/ React.createElement(
              "header",
              {
                style: {
                  height: 56,
                  flexShrink: 0,
                  borderBottom: "1px solid oklch(var(--background-200))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 16px",
                  position: "sticky",
                  top: 0,
                  background: "oklch(var(--background-50))",
                  zIndex: 20,
                },
              },
              /*#__PURE__*/ React.createElement(
                "div",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  },
                },
                /*#__PURE__*/ React.createElement(IconButton, {
                  icon: collapsed ? "ri-menu-unfold-line" : "ri-menu-fold-line",
                  "aria-label":
                    "\u0421\u0432\u0435\u0440\u043D\u0443\u0442\u044C",
                  onClick: () => setCollapsed((c) => !c),
                }),
                /*#__PURE__*/ React.createElement(
                  "h2",
                  {
                    style: {
                      fontFamily: "var(--font-heading)",
                      fontSize: 16,
                      fontWeight: 600,
                      color: "oklch(var(--foreground-900))",
                      margin: 0,
                    },
                  },
                  TITLES[current],
                ),
              ),
              /*#__PURE__*/ React.createElement(
                "div",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  },
                },
                /*#__PURE__*/ React.createElement(IconButton, {
                  icon: dark ? "ri-sun-line" : "ri-moon-line",
                  "aria-label": "\u0422\u0435\u043C\u0430",
                  onClick: onToggleTheme,
                }),
                /*#__PURE__*/ React.createElement(
                  Dropdown,
                  {
                    align: "right",
                    trigger: /*#__PURE__*/ React.createElement(
                      "button",
                      {
                        style: {
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "6px 10px",
                          borderRadius: "var(--radius-lg)",
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          fontFamily: "var(--font-body)",
                          fontSize: 14,
                          color: "oklch(var(--foreground-700))",
                        },
                      },
                      /*#__PURE__*/ React.createElement(
                        "span",
                        {
                          style: {
                            width: 28,
                            height: 28,
                            borderRadius: 9999,
                            background: "oklch(var(--primary-100))",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            fontWeight: 600,
                            color: "oklch(var(--primary-700))",
                          },
                        },
                        "A",
                      ),
                      /*#__PURE__*/ React.createElement(
                        "span",
                        {
                          style: {
                            fontWeight: 500,
                          },
                        },
                        "admin",
                      ),
                      /*#__PURE__*/ React.createElement("i", {
                        className: "ri-arrow-down-s-line",
                        style: {
                          color: "oklch(var(--foreground-400))",
                        },
                      }),
                    ),
                  },
                  /*#__PURE__*/ React.createElement(
                    DropdownLabel,
                    null,
                    "admin \xB7 \u041E\u043F\u0435\u0440\u0430\u0442\u043E\u0440",
                  ),
                  /*#__PURE__*/ React.createElement(
                    DropdownItem,
                    {
                      icon: "ri-user-line",
                      onClick: () => onNavigate("settings"),
                    },
                    "\u041F\u0440\u043E\u0444\u0438\u043B\u044C",
                  ),
                  /*#__PURE__*/ React.createElement(
                    DropdownItem,
                    {
                      icon: "ri-settings-4-line",
                      onClick: () => onNavigate("settings"),
                    },
                    "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438",
                  ),
                  /*#__PURE__*/ React.createElement(DropdownSep, null),
                  /*#__PURE__*/ React.createElement(
                    DropdownItem,
                    {
                      icon: "ri-logout-box-r-line",
                      danger: true,
                      onClick: onLogout,
                    },
                    "\u0412\u044B\u0439\u0442\u0438",
                  ),
                ),
              ),
            ),
            /*#__PURE__*/ React.createElement(
              "main",
              {
                style: {
                  flex: 1,
                  overflowY: "auto",
                },
              },
              children,
            ),
          ),
        );
      }
      window.Shell = Shell;
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: "ui_kits/inspot/Shell.jsx",
      error: String((e && e.message) || e),
    });
  }

  // ui_kits/inspot/data.js
  try {
    (() => {
      // Inspot UI-kit sample data (mirrors prototype/src/mocks). Plain global — no modules.
      window.INSPOT_DATA = {
        servers: [
          {
            id: "srv-01",
            name: "web-prod-01",
            status: "running",
            cpuPct: 38,
            ramPct: 62,
            diskPct: 54,
            cpu: "4 vCPU",
            ram: "16 GB",
            disk: "160 GB NVMe",
            ip: "49.12.34.56",
            location: "Nuremberg, DE",
            os: "Ubuntu 24.04 LTS",
          },
          {
            id: "srv-02",
            name: "web-prod-02",
            status: "running",
            cpuPct: 44,
            ramPct: 58,
            diskPct: 49,
            cpu: "4 vCPU",
            ram: "16 GB",
            disk: "160 GB NVMe",
            ip: "49.12.34.78",
            location: "Falkenstein, DE",
            os: "Ubuntu 24.04 LTS",
          },
          {
            id: "srv-03",
            name: "db-primary",
            status: "running",
            cpuPct: 71,
            ramPct: 82,
            diskPct: 68,
            cpu: "8 vCPU",
            ram: "32 GB",
            disk: "320 GB NVMe",
            ip: "78.46.12.34",
            location: "Nuremberg, DE",
            os: "Debian 12",
          },
          {
            id: "srv-04",
            name: "db-replica",
            status: "stopped",
            cpuPct: 0,
            ramPct: 0,
            diskPct: 61,
            cpu: "8 vCPU",
            ram: "32 GB",
            disk: "320 GB NVMe",
            ip: "78.46.12.56",
            location: "Helsinki, FI",
            os: "Debian 12",
          },
          {
            id: "srv-05",
            name: "cache-node",
            status: "running",
            cpuPct: 22,
            ramPct: 88,
            diskPct: 34,
            cpu: "2 vCPU",
            ram: "8 GB",
            disk: "80 GB NVMe",
            ip: "116.203.45.67",
            location: "Nuremberg, DE",
            os: "Ubuntu 24.04 LTS",
          },
          {
            id: "srv-06",
            name: "dev-staging",
            status: "stopped",
            cpuPct: 0,
            ramPct: 0,
            diskPct: 28,
            cpu: "2 vCPU",
            ram: "8 GB",
            disk: "80 GB NVMe",
            ip: "116.203.45.89",
            location: "Falkenstein, DE",
            os: "Ubuntu 24.04 LTS",
          },
        ],
        domains: [
          {
            id: "dom-01",
            name: "inspot.app",
            provider: "Cloudflare",
            registrar: "Cloudflare",
            health: "good",
            label: "Активен",
            days: 640,
          },
          {
            id: "dom-02",
            name: "inspot.io",
            provider: "Cloudflare",
            registrar: "Namecheap",
            health: "good",
            label: "Активен",
            days: 560,
          },
          {
            id: "dom-03",
            name: "inspot-cdn.net",
            provider: "Hetzner",
            registrar: "Hetzner",
            health: "warning",
            label: "21д",
            days: 21,
          },
          {
            id: "dom-04",
            name: "staging.inspot.dev",
            provider: "GoDaddy",
            registrar: "GoDaddy",
            health: "critical",
            label: "Истёк",
            days: -3,
          },
        ],
        alerts: [
          {
            id: "a1",
            severity: "critical",
            title: "Сервер web-prod-01 недоступен",
            source: "web-prod-01",
            service: "nginx",
            ago: "2м",
            ack: false,
          },
          {
            id: "a2",
            severity: "critical",
            title: "PostgreSQL: слишком много подключений",
            source: "db-primary",
            service: "postgresql",
            ago: "9м",
            ack: false,
          },
          {
            id: "a3",
            severity: "warning",
            title: "Redis: память 88% (5.3 / 6.0 GB)",
            source: "cache-node",
            service: "redis",
            ago: "13м",
            ack: false,
          },
          {
            id: "a4",
            severity: "warning",
            title: "Домен inspot-cdn.net истекает через 21 день",
            source: "cloudflare",
            service: "dns",
            ago: "1ч",
            ack: false,
          },
        ],
        emails: [
          {
            id: "e1",
            from: "Hetzner Cloud",
            subject: "Плановое обслуживание в Nuremberg DC",
            ago: "18м",
            read: false,
          },
          {
            id: "e2",
            from: "Cloudflare",
            subject: "SSL-сертификат для inspot.app продлён",
            ago: "1ч",
            read: false,
          },
          {
            id: "e3",
            from: "GitHub",
            subject: "[inspot/api] Деплой #482 завершён успешно",
            ago: "3ч",
            read: true,
          },
          {
            id: "e4",
            from: "Stripe",
            subject: "Платёж получен — €49.00",
            ago: "5ч",
            read: true,
          },
        ],
        logs: [
          {
            id: "l1",
            ts: "10:23:45",
            level: "critical",
            source: "web-prod-01",
            service: "nginx",
            message:
              "upstream timed out (110: Connection timed out) while connecting to backend:3000",
            details:
              "PID 28491 | Client: 185.220.101.34 | Request: GET /api/v2/analytics | Upstream: backend:3000 | Timeout: 60s | Retries: 3/3 exhausted",
          },
          {
            id: "l2",
            ts: "10:22:18",
            level: "error",
            source: "db-primary",
            service: "postgresql",
            message:
              'connection to database "inspot_prod" failed: FATAL: too many connections (max 200)',
            details:
              "PID: 31245 | Current connections: 200/200 | Client: 10.0.1.45 | Application: api-gateway",
          },
          {
            id: "l3",
            ts: "10:21:00",
            level: "warn",
            source: "cache-node",
            service: "redis",
            message:
              "memory usage exceeded warning threshold: 85% (4.8GB / 6.0GB)",
            details:
              "Used: 5153960755 bytes | Max: 6442450944 bytes | Eviction: allkeys-lru | Fragmentation: 1.12",
          },
          {
            id: "l4",
            ts: "10:20:30",
            level: "info",
            source: "cloudflare",
            service: "waf",
            message:
              "WAF rule triggered: SQL Injection attempt blocked (rule 942100)",
            details:
              "Zone: inspot.app | IP: 91.234.56.78 | Action: BLOCK | Country: RU",
          },
          {
            id: "l5",
            ts: "10:19:45",
            level: "info",
            source: "web-prod-02",
            service: "systemd",
            message: "Started Daily apt download activities",
            details: "Unit: apt-daily.service | Result: success",
          },
          {
            id: "l6",
            ts: "10:18:12",
            level: "debug",
            source: "api-gateway",
            service: "node",
            message: "cache hit ratio 0.94 over last 5m window",
            details: "hits: 18422 | misses: 1176 | keys: 3049",
          },
          {
            id: "l7",
            ts: "10:17:03",
            level: "warn",
            source: "web-prod-01",
            service: "nginx",
            message:
              "client sent invalid Host header while reading client request",
            details: "Client: 45.155.205.108 | Host: (empty) | Action: 400",
          },
          {
            id: "l8",
            ts: "10:15:30",
            level: "error",
            source: "db-replica",
            service: "postgresql",
            message: "replication lag exceeded 30s (current: 47s)",
            details:
              "Primary LSN: 3A/9F0012 | Replica LSN: 3A/9C0044 | Lag: 47s",
          },
        ],
        levels: {
          debug: {
            label: "DEBUG",
            tone: "neutral",
            icon: "ri-bug-line",
          },
          info: {
            label: "INFO",
            tone: "accent",
            icon: "ri-information-line",
          },
          warn: {
            label: "WARN",
            tone: "amber",
            icon: "ri-alert-line",
          },
          error: {
            label: "ERROR",
            tone: "red",
            icon: "ri-error-warning-line",
          },
          critical: {
            label: "CRIT",
            tone: "red",
            icon: "ri-close-circle-line",
          },
        },
        nav: [
          {
            path: "dashboard",
            label: "Дашборд",
            icon: "ri-home-line",
          },
          {
            path: "servers",
            label: "Серверы",
            icon: "ri-server-line",
          },
          {
            path: "domains",
            label: "Домены",
            icon: "ri-global-line",
          },
          {
            path: "monitoring",
            label: "Мониторинг",
            icon: "ri-dashboard-line",
          },
          {
            path: "backups",
            label: "Бэкапы",
            icon: "ri-hard-drive-3-line",
          },
          {
            path: "mail",
            label: "Почта",
            icon: "ri-mail-line",
          },
          {
            path: "logs",
            label: "Логи",
            icon: "ri-file-list-3-line",
          },
          {
            path: "alerts",
            label: "Оповещения",
            icon: "ri-alert-line",
          },
        ],
      };
    })();
  } catch (e) {
    __ds_ns.__errors.push({
      path: "ui_kits/inspot/data.js",
      error: String((e && e.message) || e),
    });
  }

  __ds_ns.Badge = __ds_scope.Badge;

  __ds_ns.Card = __ds_scope.Card;

  __ds_ns.EmptyState = __ds_scope.EmptyState;

  __ds_ns.IconTile = __ds_scope.IconTile;

  __ds_ns.ProgressBar = __ds_scope.ProgressBar;

  __ds_ns.StatCard = __ds_scope.StatCard;

  __ds_ns.Dropdown = __ds_scope.Dropdown;

  __ds_ns.DropdownItem = __ds_scope.DropdownItem;

  __ds_ns.DropdownSep = __ds_scope.DropdownSep;

  __ds_ns.DropdownLabel = __ds_scope.DropdownLabel;

  __ds_ns.Modal = __ds_scope.Modal;

  __ds_ns.Toast = __ds_scope.Toast;

  __ds_ns.Button = __ds_scope.Button;

  __ds_ns.IconButton = __ds_scope.IconButton;

  __ds_ns.Input = __ds_scope.Input;

  __ds_ns.SegmentedControl = __ds_scope.SegmentedControl;

  __ds_ns.Switch = __ds_scope.Switch;
})();
