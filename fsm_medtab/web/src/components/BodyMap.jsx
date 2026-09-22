import { useState } from "react";
import { cx } from "../lib/ui.js";

/**
 * Anterior / posterior injury chart. The figure is drawn entirely in SVG —
 * it has to scale with the panel, and a raster silhouette would either
 * distort or go soft. Markers are real HTML buttons laid over the drawing in
 * the same coordinate space (0-120 × 0-200), so they are focusable and
 * keyboard-reachable instead of being click targets painted into the canvas.
 */

export const SEVERITY = {
  critical: { color: "#ff2d55", label: "Critical" },
  major: { color: "#ff74a8", label: "Major" },
  moderate: { color: "#ffc24b", label: "Moderate" },
  minor: { color: "#35e0a1", label: "Minor" },
};

const VB_W = 120;
const VB_H = 200;

function Figure({ view }) {
  const skinFill = "url(#mt-body-fill)";
  const edge = "rgba(255,116,168,.42)";
  const detail = "rgba(255,116,168,.22)";

  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="mt-body-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,116,168,.16)" />
          <stop offset="48%" stopColor="rgba(255,45,85,.09)" />
          <stop offset="100%" stopColor="rgba(120,20,50,.07)" />
        </linearGradient>
        <filter id="mt-body-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <g id="mt-arm">
          <path d="M41,43 C35.5,46 32.2,52.5 31.2,61 L28.4,88 C27.7,95 27.2,102 26.8,110 C26.5,116 28.6,119 31.4,119 C34.2,119 35.8,116 36.2,110 C36.8,102 37.4,95 38.1,88 L41.6,61 Z" />
          <ellipse cx="31.4" cy="123" rx="3.7" ry="4.8" />
        </g>
        <g id="mt-leg">
          <path d="M43.5,119 C43,131 43.8,143 44.8,154 L46.2,178 C46.5,185 46.8,189.5 50.5,190 C54.2,190.5 55.8,187 56,181 L57.6,154 C58.2,143 58.8,131 59,119 Z" />
          <ellipse cx="51.2" cy="192.5" rx="5" ry="3.2" />
        </g>
      </defs>

      <g fill={skinFill} stroke={edge} strokeWidth="0.7" filter="url(#mt-body-glow)">
        {/* head + neck */}
        <ellipse cx="60" cy="22" rx="11.5" ry="13.5" />
        <path d="M54,32 h12 v7.5 c0,2.2 -12,2.2 -12,0 Z" />
        {/* torso */}
        <path d="M60,38 C51.5,38 45,39.5 41.5,42.5 C38,45.5 37,50 37.6,57 L39.6,84 C40.2,93 41,100 41.8,107 L42.8,118 C47.5,121.5 53,123 60,123 C67,123 72.5,121.5 77.2,118 L78.2,107 C79,100 79.8,93 80.4,84 L82.4,57 C83,50 82,45.5 78.5,42.5 C75,39.5 68.5,38 60,38 Z" />
        {/* arms — one path, mirrored for the other side */}
        <use href="#mt-arm" />
        <use href="#mt-arm" transform="translate(120,0) scale(-1,1)" />
        {/* legs */}
        <use href="#mt-leg" />
        <use href="#mt-leg" transform="translate(120,0) scale(-1,1)" />
      </g>

      {/* anatomical detail lines — schematic, not decoration for its own sake */}
      <g stroke={detail} strokeWidth="0.55" fill="none" strokeLinecap="round">
        {view === "front" ? (
          <>
            <path d="M47,47 C53,50 67,50 73,47" />
            <path d="M60,52 L60,104" strokeDasharray="1.5 2.5" />
            <path d="M46,64 C53,68 67,68 74,64" />
            <path d="M45,73 C53,77 67,77 75,73" />
            <path d="M44.5,110 C52,113 68,113 75.5,110" />
            <circle cx="60" cy="100" r="1.6" />
            {/* face guides */}
            <path d="M55,20 h3.2 M61.8,20 h3.2" />
            <path d="M56.5,28 C58.5,29.5 61.5,29.5 63.5,28" />
          </>
        ) : (
          <>
            <path d="M60,42 L60,118" strokeDasharray="2 2.6" />
            <path d="M48,52 C52,60 52,68 49.5,76" />
            <path d="M72,52 C68,60 68,68 70.5,76" />
            <path d="M46,108 C53,111 67,111 74,108" />
            <path d="M52,16 C56,12 64,12 68,16" />
          </>
        )}
      </g>
    </svg>
  );
}

export default function BodyMap({ injuries = [], selectedId, onSelect, className }) {
  const [view, setView] = useState("front");
  const shown = injuries.filter((injury) => (injury.side || "front") === view);
  const hiddenCount = injuries.length - shown.length;

  return (
    <div className={cx("flex h-full flex-col", className)}>
      <div className="flex items-center gap-1.5 px-4 pb-2">
        {["front", "back"].map((side) => (
          <button
            key={side}
            type="button"
            onClick={() => setView(side)}
            className={cx(
              "mt-btn h-6 rounded-md px-2.5 text-[9px] font-semibold uppercase tracking-[0.16em]",
              view === side && "border-[var(--line-hot)] text-[var(--pink)]",
            )}
          >
            {side === "front" ? "Anterior" : "Posterior"}
          </button>
        ))}
        {hiddenCount > 0 ? (
          <span className="mt-num ml-auto text-[9px] text-[var(--text-faint)]">
            +{hiddenCount} other side
          </span>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1 px-4 pb-4">
        <div className="relative mx-auto h-full w-full max-w-[210px]">
          <Figure view={view} />

          {shown.map((injury) => {
            const tone = SEVERITY[injury.severity] || SEVERITY.minor;
            const active = injury.id === selectedId;
            return (
              <button
                key={injury.id}
                type="button"
                onClick={() => onSelect && onSelect(injury)}
                title={`${injury.label} — ${tone.label}`}
                aria-label={`${injury.label}, ${tone.label}`}
                aria-pressed={active}
                className="absolute grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--pink)]"
                style={{ left: `${(injury.x / VB_W) * 100}%`, top: `${(injury.y / VB_H) * 100}%` }}
              >
                {injury.severity === "critical" ? (
                  <span
                    className="mt-a-ping absolute h-4 w-4 rounded-full"
                    style={{ border: `1.5px solid ${tone.color}` }}
                  />
                ) : null}
                <span
                  className="absolute h-4 w-4 rounded-full transition-transform duration-200"
                  style={{
                    border: `1px solid ${tone.color}`,
                    background: `color-mix(in srgb, ${tone.color} 14%, transparent)`,
                    transform: active ? "scale(1.35)" : "scale(1)",
                  }}
                />
                <span
                  className="relative h-[7px] w-[7px] rounded-full"
                  style={{ background: tone.color, boxShadow: `0 0 10px 1px ${tone.color}` }}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--line-2)] px-4 py-2">
        {Object.entries(SEVERITY).map(([key, tone]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.color }} />
            <span className="text-[8.5px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
              {tone.label}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
