/**
 * Small shared helpers. Nothing here may touch a FiveM-only global at module
 * scope — the same bundle runs in the studio preview (a plain browser) and in
 * CEF inside the game.
 */
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cx(...parts) {
  return twMerge(clsx(parts));
}

/**
 * ONE asset style for the whole project: every file under web/public/ is
 * resolved to an absolute url against the document base. A root-absolute
 * "/img/…" ignores the preview's per-session base and 404s; a bare relative
 * path breaks once it is substituted into a CSS var.
 */
const BASE = import.meta.env.BASE_URL;
export const asset = (path) => new URL(BASE + path, document.baseURI).href;

export const pad2 = (n) => String(n).padStart(2, "0");

/** seconds → m:ss, used for call timers and treatment progress */
export function clock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${pad2(s % 60)}`;
}

/** seconds → 1h 04m, used for shift length */
export function duration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${pad2(m)}m` : `${m}m ${pad2(s % 60)}s`;
}

export const initials = (name) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** deterministic pseudo-random so mock sparklines don't reshuffle each render */
export function seeded(seed, count, lo, hi) {
  const out = [];
  let x = seed * 9301 + 49297;
  for (let i = 0; i < count; i += 1) {
    x = (x * 9301 + 49297) % 233280;
    out.push(lo + (x / 233280) * (hi - lo));
  }
  return out;
}

export const TRIAGE = {
  red: { label: "IMMEDIATE", short: "P1", color: "var(--tri-red)", desc: "Life threat — treat now" },
  yellow: { label: "DELAYED", short: "P2", color: "var(--tri-yellow)", desc: "Serious, can wait briefly" },
  green: { label: "MINOR", short: "P3", color: "var(--tri-green)", desc: "Walking wounded" },
  black: { label: "EXPECTANT", short: "P4", color: "var(--tri-black)", desc: "Deceased / unsalvageable" },
};

/** Vital reference ranges — drives the out-of-range colouring on every tile. */
export const VITAL_RANGE = {
  hr: [60, 100],
  sys: [100, 140],
  dia: [60, 90],
  spo2: [95, 100],
  rr: [12, 20],
  temp: [36.1, 37.5],
  gcs: [14, 15],
};

export function vitalState(key, value) {
  const range = VITAL_RANGE[key];
  if (!range) return "ok";
  const [lo, hi] = range;
  if (value < lo * 0.82 || value > hi * 1.25) return "crit";
  if (value < lo || value > hi) return "warn";
  return "ok";
}

export const STATE_COLOR = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  crit: "var(--crit)",
};
