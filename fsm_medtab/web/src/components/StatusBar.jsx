import { useEffect, useState } from "react";
import { BatteryMedium, Radio, Siren, Wifi, X } from "lucide-react";
import { asset, cx, duration, pad2 } from "../lib/ui.js";
import { useMedtab } from "../state/store.jsx";
import { Chip, IconBtn } from "./ui/Kit.jsx";

const TONE = { ok: "var(--ok)", warn: "var(--warn)", crit: "var(--crit)", dim: "var(--text-faint)" };

export default function StatusBar({ activeCall, onClose, shiftSeconds }) {
  const { medic, unitStatus, unitStatuses, setStatus, live } = useMedtab();
  const [now, setNow] = useState(() => new Date());
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const codes = unitStatuses && unitStatuses.length ? unitStatuses : [];
  const current = codes.find((entry) => entry.code === unitStatus) || codes[0] || { code: "10-8", label: "Available", tone: "ok" };
  const tone = TONE[current.tone];

  return (
    <header className="relative z-30 flex h-12 shrink-0 items-center gap-2 border-b border-[var(--line)] px-3 sm:gap-3 sm:px-4">
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, var(--line-hot), transparent)" }}
      />

      <img src={asset("img/icons/ems-crest.png")} alt="" className="h-6 w-6 shrink-0 object-contain" />
      <span className="hidden shrink-0 text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--text)] sm:inline">
        Med<span className="text-[var(--crit)]">Tab</span>
      </span>

      {/* unit status — the one control that changes the tablet's own state */}
      <div className="relative ml-1 sm:ml-2">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          className="mt-btn h-8 rounded-lg px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: tone, borderColor: `color-mix(in srgb, ${tone} 45%, transparent)` }}
        >
          <span className="h-1.5 w-1.5 rounded-full mt-a-pulse" style={{ background: tone }} />
          <span className="mt-num">{current.code}</span>
          <span className="hidden md:inline">{current.label}</span>
        </button>

        {menuOpen ? (
          <>
            <button
              type="button"
              aria-label="Close status menu"
              className="fixed inset-0 z-10 cursor-default"
              onClick={() => setMenuOpen(false)}
            />
            <div className="mt-panel absolute left-0 top-10 z-20 w-56 overflow-hidden rounded-xl p-1.5">
              {codes.map((entry) => (
                <button
                  key={entry.code}
                  type="button"
                  onClick={() => {
                    setStatus(entry.code);
                    setMenuOpen(false);
                  }}
                  className={cx(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                    entry.code === unitStatus ? "bg-[var(--crit-soft)]" : "hover:bg-[rgba(255,116,168,.07)]",
                  )}
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TONE[entry.tone] }} />
                  <span className="mt-num shrink-0 text-[10px]" style={{ color: TONE[entry.tone] }}>
                    {entry.code}
                  </span>
                  <span className="truncate text-[11px] text-[var(--text-dim)]">{entry.label}</span>
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {activeCall ? (
        <Chip color="var(--crit)" icon={Siren} className="mt-a-pulse hidden shrink-0 lg:inline-flex">
          Active · {activeCall}
        </Chip>
      ) : null}

      {/* No state has arrived from the server, so the tablet is drawing the
          bundled sample board. Says so rather than passing it off as live. */}
      {!live ? (
        <Chip color="var(--text-faint)" className="hidden shrink-0 md:inline-flex">
          Sample data
        </Chip>
      ) : null}

      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
        <span className="mt-num hidden text-[10px] text-[var(--text-faint)] xl:inline">
          Shift {duration(shiftSeconds)}
        </span>
        <span className="mt-num hidden items-center gap-1.5 text-[10px] text-[var(--text-dim)] md:flex">
          <Radio className="h-3 w-3 text-[var(--pink)]" />
          {medic.callsign}
        </span>
        <span className="hidden items-center gap-1 sm:flex">
          <Wifi className="h-3.5 w-3.5 text-[var(--text-faint)]" />
          <span className="flex items-end gap-[2px]" aria-label="Signal strength 3 of 4">
            {[4, 7, 10, 13].map((bar, index) => (
              <span
                key={bar}
                className="w-[2px] rounded-full"
                style={{ height: bar, background: index < 3 ? "var(--pink)" : "var(--text-faint)" }}
              />
            ))}
          </span>
        </span>
        <span className="flex items-center gap-1">
          <BatteryMedium className="h-3.5 w-3.5 text-[var(--ok)]" />
          <span className="mt-num text-[10px] text-[var(--text-dim)]">64%</span>
        </span>
        <span className="mt-num text-[12px] tabular-nums text-[var(--text)]">
          {pad2(now.getHours())}:{pad2(now.getMinutes())}
          <span className="text-[var(--text-faint)]">:{pad2(now.getSeconds())}</span>
        </span>
        <IconBtn icon={X} label="Close tablet" onClick={onClose} />
      </div>
    </header>
  );
}
