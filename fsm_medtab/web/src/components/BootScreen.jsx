import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, Fingerprint, ShieldCheck } from "lucide-react";
import { asset, cx } from "../lib/ui.js";
import { useMedtab } from "../state/store.jsx";
import { Avatar, Chip } from "./ui/Kit.jsx";

const BOOT_LINES = [
  "MEDTAB OS 4.2.1 — Los Santos EMS",
  "mounting /dispatch … ok",
  "linking Pillbox Hill records … ok",
  "telemetry uplink … 4 units online",
  "narcotics log verified … sealed",
  "biometric reader ready",
];

export default function BootScreen({ onEnter }) {
  const { medic } = useMedtab();
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const enterRef = useRef(null);

  useEffect(() => {
    const lineTimer = setInterval(() => {
      setStep((current) => {
        if (current >= BOOT_LINES.length) {
          clearInterval(lineTimer);
          return current;
        }
        return current + 1;
      });
    }, 260);
    return () => clearInterval(lineTimer);
  }, []);

  useEffect(() => {
    const bar = setInterval(() => {
      setProgress((value) => {
        const next = value + Math.random() * 11 + 4;
        if (next >= 100) {
          clearInterval(bar);
          setReady(true);
          return 100;
        }
        return next;
      });
    }, 150);
    return () => clearInterval(bar);
  }, []);

  // move focus to the sign-in control the moment boot finishes
  useEffect(() => {
    if (ready && enterRef.current) enterRef.current.focus();
  }, [ready]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* hero scene — a background layer, never an <img> standing in for UI */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url("${asset("img/ems-hero.jpg")}")`,
          backgroundSize: "cover",
          backgroundPosition: "center 42%",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(6,4,10,.96) 0%, rgba(6,4,10,.82) 38%, rgba(12,4,12,.45) 70%, rgba(255,45,85,.10) 100%)",
        }}
      />
      <div className="mt-grid pointer-events-none absolute inset-0 opacity-25" />

      <div className="relative flex h-full flex-col justify-between gap-6 overflow-y-auto p-6 sm:p-10">
        <div className="flex items-start gap-4">
          <img
            src={asset("img/icons/ems-crest.png")}
            alt="Los Santos EMS crest"
            className="h-14 w-14 shrink-0 object-contain drop-shadow-[0_0_18px_rgba(255,45,85,.55)] sm:h-[72px] sm:w-[72px]"
          />
          <div className="min-w-0">
            <h1 className="font-[var(--font-display)] text-3xl font-bold uppercase leading-none tracking-[0.06em] text-[var(--text)] sm:text-5xl">
              Med<span className="text-[var(--crit)]">Tab</span>
            </h1>
            <p className="mt-1.5 text-[10px] uppercase tracking-[0.3em] text-[var(--text-faint)] sm:text-[11px]">
              Los Santos Emergency Medical Services
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          {/* boot log */}
          <div className="min-w-0 max-w-md flex-1">
            <div className="mt-num space-y-1 text-[10px] leading-relaxed text-[var(--text-faint)]">
              {BOOT_LINES.slice(0, step).map((line, index) => (
                <motion.div
                  key={line}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-2"
                >
                  <span className="text-[var(--crit)]">›</span>
                  <span className={cx(index === step - 1 && !ready && "text-[var(--text-dim)]")}>{line}</span>
                </motion.div>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-3">
              <div className="mt-inset h-[5px] flex-1 overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full transition-[width] duration-150"
                  style={{
                    width: `${progress}%`,
                    background: "linear-gradient(90deg, var(--crit-deep), var(--crit), var(--pink))",
                    boxShadow: "0 0 14px -2px var(--crit)",
                  }}
                />
              </div>
              <span className="mt-num w-9 shrink-0 text-right text-[10px] text-[var(--text-dim)]">
                {Math.round(progress)}%
              </span>
            </div>
          </div>

          {/* sign-in card */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, type: "spring", stiffness: 260, damping: 26 }}
            className="mt-panel mt-panel-hot w-full shrink-0 rounded-2xl p-5 lg:w-[330px]"
          >
            <div className="flex items-center gap-3">
              <Avatar name={medic.name} size={46} ring />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--text)]">{medic.name}</p>
                <p className="mt-num truncate text-[10px] text-[var(--text-faint)]">
                  {medic.rank} · {medic.badge}
                </p>
              </div>
            </div>

            <div className="mt-3.5 flex flex-wrap gap-1.5">
              {(medic.certs || []).map((cert) => (
                <Chip key={cert} color="var(--pink)" icon={ShieldCheck}>
                  {cert}
                </Chip>
              ))}
            </div>

            <div className="mt-hair my-4" />

            <button
              ref={enterRef}
              type="button"
              onClick={onEnter}
              disabled={!ready}
              className={cx(
                "mt-btn mt-btn-primary h-12 w-full rounded-xl text-[11px] font-semibold uppercase tracking-[0.22em]",
                ready && "mt-a-breathe",
              )}
            >
              <Fingerprint className="h-4 w-4" />
              {ready ? "Begin shift" : "Authenticating…"}
              {ready ? <ChevronRight className="h-4 w-4" /> : null}
            </button>

            <p className="mt-3 text-center text-[9px] uppercase tracking-[0.16em] text-[var(--text-faint)]">
              {medic.station} · {medic.callsign}
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
