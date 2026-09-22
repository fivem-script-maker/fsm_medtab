import { cx, initials } from "../../lib/ui.js";

/* ── Panel ────────────────────────────────────────────────────────────────
   Every surface in the tablet is one of these: a layered gradient plate with
   a hairline border, never a flat background:<colour> box. `hot` adds the
   crimson rim used for anything urgent. */
export function Panel({ hot = false, className, children, ...rest }) {
  return (
    <div className={cx("mt-panel rounded-xl", hot && "mt-panel-hot", className)} {...rest}>
      {children}
    </div>
  );
}

/* Section header: label, optional count pill, optional right-hand slot. */
export function SectionTitle({ icon: Icon, title, hint, right, className }) {
  return (
    <div className={cx("flex items-center gap-2.5 px-4 pt-3.5 pb-2.5", className)}>
      {Icon ? (
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-[var(--line)] bg-[var(--crit-soft)]">
          <Icon className="h-3.5 w-3.5 text-[var(--pink)]" />
        </span>
      ) : null}
      <h2 className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text)]">
        {title}
      </h2>
      {hint ? (
        <span className="mt-num shrink-0 rounded-full border border-[var(--line)] px-1.5 py-0.5 text-[9px] text-[var(--text-faint)]">
          {hint}
        </span>
      ) : null}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">{right}</div>
    </div>
  );
}

/* ── Chip ─────────────────────────────────────────────────────────────────
   `color` is a CSS colour string; the chip borrows it for border, text and a
   tinted wash so one prop themes the whole pill. */
export function Chip({ color = "var(--pink)", tint = 0.12, icon: Icon, children, className, ...rest }) {
  return (
    <span
      className={cx("mt-chip rounded-full px-2 py-[3px] text-[9.5px] font-semibold uppercase tracking-[0.14em]", className)}
      style={{ color, borderColor: color, background: `color-mix(in srgb, ${color} ${tint * 100}%, transparent)` }}
      {...rest}
    >
      {Icon ? <Icon className="h-2.5 w-2.5" /> : null}
      {children}
    </span>
  );
}

/* ── Button ───────────────────────────────────────────────────────────────*/
export function Btn({ variant = "ghost", size = "md", icon: Icon, children, className, ...rest }) {
  const sizes = {
    sm: "h-7 px-2.5 text-[10px] tracking-[0.14em] rounded-md",
    md: "h-9 px-3.5 text-[10.5px] tracking-[0.16em] rounded-lg",
    lg: "h-11 px-5 text-[11.5px] tracking-[0.18em] rounded-lg",
  };
  const icons = { sm: "h-3 w-3", md: "h-3.5 w-3.5", lg: "h-4 w-4" };
  return (
    <button
      type="button"
      className={cx(
        "mt-btn font-semibold uppercase",
        variant === "primary" && "mt-btn-primary",
        sizes[size],
        className,
      )}
      {...rest}
    >
      {Icon ? <Icon className={icons[size]} /> : null}
      {children}
    </button>
  );
}

/* Square icon-only button, used in the status bar and card corners. */
export function IconBtn({ icon: Icon, label, active = false, className, ...rest }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "mt-btn grid h-8 w-8 shrink-0 place-items-center rounded-lg",
        active && "border-[var(--line-hot)] text-[var(--pink)]",
        className,
      )}
      {...rest}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

/* ── Meter ────────────────────────────────────────────────────────────────
   Horizontal fill bar with a notched track. Used for stock, fuel, blood
   loss, TBSA — anything 0-100. */
export function Meter({ value, max = 100, color = "var(--crit)", height = 6, ticks = true, className }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      className={cx("mt-inset relative w-full overflow-hidden rounded-full", className)}
      style={{ height }}
      role="meter"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {ticks ? (
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage: "repeating-linear-gradient(90deg, transparent 0 9px, rgba(0,0,0,.65) 9px 10px)",
          }}
        />
      ) : null}
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{
          width: `${pct}%`,
          background: `linear-gradient(90deg, color-mix(in srgb, ${color} 55%, #000), ${color})`,
          boxShadow: `0 0 12px -2px ${color}`,
        }}
      />
    </div>
  );
}

/* ── Stat tile ────────────────────────────────────────────────────────────*/
export function StatTile({ icon: Icon, label, value, unit, sub, color = "var(--pink)", className }) {
  return (
    <div className={cx("mt-panel relative overflow-hidden rounded-xl px-3.5 py-3", className)}>
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-25 blur-xl"
        style={{ background: color }}
      />
      <div className="flex items-center gap-2">
        {Icon ? <Icon className="h-3.5 w-3.5" style={{ color }} /> : null}
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">
          {label}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="mt-num text-2xl leading-none text-[var(--text)]">{value}</span>
        {unit ? <span className="text-[10px] text-[var(--text-faint)]">{unit}</span> : null}
      </div>
      {sub ? <div className="mt-1.5 text-[10px] text-[var(--text-dim)]">{sub}</div> : null}
    </div>
  );
}

/* ── Avatar ───────────────────────────────────────────────────────────────
   No portrait art for roster entries — a built monogram plate keeps every
   row identical in weight and never distorts. */
export function Avatar({ name, size = 36, color = "var(--crit)", ring = false, className }) {
  return (
    <div
      className={cx("relative grid shrink-0 place-items-center rounded-lg font-semibold", className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.34,
        color: "#fff",
        background: `linear-gradient(150deg, color-mix(in srgb, ${color} 78%, #200), color-mix(in srgb, ${color} 22%, #120a13))`,
        boxShadow: ring
          ? `0 0 0 1px color-mix(in srgb, ${color} 60%, transparent), 0 0 18px -6px ${color}`
          : "inset 0 1px 0 rgba(255,255,255,.18)",
      }}
    >
      {initials(name)}
    </div>
  );
}

/* ── Empty state ──────────────────────────────────────────────────────────*/
export function Empty({ icon: Icon, title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {Icon ? <Icon className="h-7 w-7 text-[var(--text-faint)]" /> : null}
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]">{title}</p>
      {hint ? <p className="max-w-[26ch] text-[10.5px] leading-relaxed text-[var(--text-faint)]">{hint}</p> : null}
    </div>
  );
}

/* Label/value row used across every detail panel. */
export function Field({ label, value, mono = false, color, className }) {
  return (
    <div className={cx("flex items-baseline justify-between gap-3 py-1.5", className)}>
      <span className="shrink-0 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">
        {label}
      </span>
      <span
        className={cx("truncate text-right text-[11.5px] text-[var(--text)]", mono && "mt-num")}
        style={color ? { color } : undefined}
      >
        {value}
      </span>
    </div>
  );
}
