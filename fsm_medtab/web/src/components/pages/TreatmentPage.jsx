import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Ambulance,
  Bandage,
  Calculator,
  CircleCheck,
  Droplet,
  Flame,
  HeartPulse,
  ListChecks,
  Scissors,
  ShieldCheck,
  Stethoscope,
  Syringe,
  Wind,
  X,
  Zap,
} from "lucide-react";
import { asset, clamp, clock, cx, TRIAGE } from "../../lib/ui.js";
import { useMedtab } from "../../state/store.jsx";
import { Avatar, Btn, Chip, Empty, Meter, Panel, SectionTitle } from "../ui/Kit.jsx";

const ICONS = {
  stethoscope: Stethoscope,
  heart: HeartPulse,
  zap: Zap,
  bandage: Bandage,
  shield: ShieldCheck,
  droplet: Droplet,
  wind: Wind,
  syringe: Syringe,
  bone: Bandage,
  scissors: Scissors,
  flame: Flame,
  ambulance: Ambulance,
};

const TONE = { crit: "var(--crit)", treat: "var(--pink)", assess: "var(--text-dim)" };

export default function TreatmentPage({ selectedPatientId, onSelectPatient }) {
  const {
    beginTreatment,
    cancelTreatment,
    patients,
    protocols,
    pushToast,
    rules,
    supplies,
    treatments,
  } = useMedtab();
  const [now, setNow] = useState(() => Date.now());
  const [certFilter, setCertFilter] = useState("all");
  const [doseMgPerKg, setDoseMgPerKg] = useState("0.1");

  const treatable = patients.filter((patient) => patient.triage !== "black");
  const patient = patients.find((entry) => entry.id === selectedPatientId) || treatable[0] || patients[0] || null;

  /* Smooth progress only while something is running. The countdown is cosmetic:
     the server times the treatment itself and rejects an early finish. */
  useEffect(() => {
    if (treatments.length === 0) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 120);
    return () => clearInterval(timer);
  }, [treatments.length]);

  /* The kit the medic is CARRYING is what a protocol spends — the server takes
     the item from their own inventory, not off the station shelf. */
  const carriedOf = (itemId) => supplies.find((item) => item.id === itemId);

  const running = (protocolId) => treatments.find((entry) => entry.protocol === protocolId) || null;

  const tooFar =
    patient && typeof patient.distance === "number" && patient.distance > (rules.treatDistance || 4);

  const start = (protocol) => {
    if (!patient) return;
    if (running(protocol.id)) {
      pushToast({ title: "Already in progress", body: protocol.name, tone: "warn" });
      return;
    }
    if (!protocol.allowed) {
      pushToast({ title: "Not certified", body: `${protocol.cert} certification required.`, tone: "crit" });
      return;
    }
    /* Both checks below are courtesy only — the server runs them again and its
       answer is the one that counts. */
    const item = protocol.item ? carriedOf(protocol.item) : null;
    if (item && (item.carried || 0) === 0) {
      pushToast({ title: "Not in your kit", body: `${item.label} — draw one from station supply.`, tone: "crit" });
      return;
    }
    if (tooFar) {
      pushToast({ title: "Too far", body: `Move within ${rules.treatDistance || 4}m of the patient.`, tone: "warn" });
      return;
    }
    setNow(Date.now());
    beginTreatment(protocol.id, patient.serverId, patient.name);
  };

  const filtered = protocols.filter((protocol) => certFilter === "all" || protocol.cert === certFilter);

  const dose = useMemo(() => {
    const rate = Number.parseFloat(doseMgPerKg);
    if (!Number.isFinite(rate) || rate <= 0 || !patient) return null;
    return (rate * (patient.weightKg || 0)).toFixed(2);
  }, [doseMgPerKg, patient]);

  if (!patient) {
    return (
      <div className="h-full p-3 sm:p-4">
        <Panel className="h-full">
          <Empty
            icon={Stethoscope}
            title="No patient on the board"
            hint="A casualty appears here as soon as a unit reports one down."
          />
        </Panel>
      </div>
    );
  }

  const triage = TRIAGE[patient.triage] || TRIAGE.green;

  return (
    <div className="grid h-full grid-cols-1 gap-3 overflow-y-auto p-3 sm:p-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      {/* ── Left: who, what's running, dose maths ───────────────────────── */}
      <div className="flex flex-col gap-3 roomy:min-h-0">
        <Panel hot={patient.triage === "red"} className="shrink-0 overflow-hidden">
          <SectionTitle icon={HeartPulse} title="Treating" right={<Chip color={triage.color}>{triage.short}</Chip>} />
          <div className="flex items-center gap-3 px-4 pb-3">
            <Avatar name={patient.name} size={40} color={triage.color} ring />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold text-[var(--text)]">{patient.name}</p>
              <p className="truncate text-[10px] text-[var(--text-faint)]">{patient.complaint}</p>
              {typeof patient.distance === "number" ? (
                <p
                  className="mt-num mt-0.5 truncate text-[9px]"
                  style={{ color: tooFar ? "var(--warn)" : "var(--ok)" }}
                >
                  {patient.distance}m away{tooFar ? " — move closer to treat" : " — in reach"}
                </p>
              ) : null}
            </div>
          </div>
          <div className="border-t border-[var(--line-2)] px-3 py-2">
            <label htmlFor="mt-treat-patient" className="text-[8.5px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">
              Switch patient
            </label>
            <select
              id="mt-treat-patient"
              value={patient.id}
              onChange={(event) => onSelectPatient(event.target.value)}
              className="mt-field mt-1.5 h-8 w-full rounded-lg px-2 text-[11px]"
            >
              {patients.map((entry) => (
                <option key={entry.id} value={entry.id} style={{ background: "#120a13" }}>
                  {entry.name} — {(TRIAGE[entry.triage] || TRIAGE.green).short}
                </option>
              ))}
            </select>
          </div>
        </Panel>

        <Panel className="flex h-[300px] flex-col overflow-hidden roomy:h-auto roomy:min-h-[160px] roomy:flex-1">
          <SectionTitle icon={ListChecks} title="In progress" hint={`${treatments.length}`} />
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
            <AnimatePresence initial={false}>
              {treatments.map((entry) => {
                const elapsed = (now - entry.startedAt) / 1000;
                const pct = clamp((elapsed / entry.seconds) * 100, 0, 100);
                const source = protocols.find((item) => item.id === entry.protocol);
                const color = TONE[source && source.tone] || "var(--pink)";
                return (
                  <motion.li
                    key={entry.token}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-raise rounded-lg px-2.5 py-2">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[var(--text)]">
                          {entry.name}
                        </span>
                        <span className="mt-num shrink-0 text-[10px]" style={{ color }}>
                          {clock(Math.max(0, entry.seconds - elapsed))}
                        </span>
                        <button
                          type="button"
                          onClick={() => cancelTreatment(entry.token)}
                          aria-label={`Cancel ${entry.name}`}
                          className="shrink-0 text-[var(--text-faint)] transition-colors hover:text-[var(--crit)]"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <p className="mt-0.5 truncate text-[9px] text-[var(--text-faint)]">
                        {entry.patientLabel || patient.name}
                      </p>
                      <Meter value={pct} color={color} height={4} ticks={false} className="mt-1.5" />
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
            {treatments.length === 0 ? (
              <li>
                <Empty icon={CircleCheck} title="Nothing running" hint="Pick a protocol from the catalogue." />
              </li>
            ) : null}
          </ul>
        </Panel>

        <Panel className="shrink-0 overflow-hidden">
          <SectionTitle icon={Calculator} title="Dose calculator" />
          <div className="space-y-2 px-4 pb-3.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-[var(--text-faint)]">Patient weight</span>
              <span className="mt-num text-[var(--text)]">{patient.weightKg || "—"} kg</span>
            </div>
            <div>
              <label htmlFor="mt-dose" className="text-[8.5px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">
                Rate (mg/kg)
              </label>
              <input
                id="mt-dose"
                type="number"
                min="0"
                step="0.01"
                value={doseMgPerKg}
                onChange={(event) => setDoseMgPerKg(event.target.value)}
                className="mt-field mt-num mt-1 h-8 w-full rounded-lg px-2.5 text-[11px]"
              />
            </div>
            <div className="mt-inset flex items-baseline justify-between rounded-lg px-3 py-2">
              <span className="text-[9px] uppercase tracking-[0.16em] text-[var(--text-faint)]">Total dose</span>
              <span className="mt-num text-lg leading-none text-[var(--pink)]">
                {dose === null ? "—" : `${dose} mg`}
              </span>
            </div>
            <p className="text-[9px] leading-relaxed text-[var(--text-faint)]">
              Reference maths only. Confirm against your service's own drug protocol before administering.
            </p>
          </div>
        </Panel>
      </div>

      {/* ── Right: protocol catalogue ───────────────────────────────────── */}
      <Panel className="flex h-[460px] flex-col overflow-hidden roomy:h-auto roomy:min-h-0">
        <SectionTitle
          icon={Stethoscope}
          title="Protocol catalogue"
          hint={`${filtered.length}`}
          right={
            <div className="flex gap-1">
              {["all", "BLS", "ALS"].map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCertFilter(key)}
                  aria-pressed={certFilter === key}
                  className={cx(
                    "mt-btn h-6 rounded-md px-2 text-[9px] font-semibold uppercase tracking-[0.12em]",
                    certFilter === key && "border-[var(--line-hot)] text-[var(--pink)]",
                  )}
                >
                  {key}
                </button>
              ))}
            </div>
          }
        />

        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-2.5 overflow-y-auto px-3 pb-3 sm:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((protocol) => {
            const Icon = ICONS[protocol.icon] || Stethoscope;
            const color = TONE[protocol.tone] || "var(--pink)";
            const item = protocol.item ? carriedOf(protocol.item) : null;
            const inProgress = Boolean(running(protocol.id));
            const carried = item ? item.carried || 0 : null;
            const missing = Boolean(item && carried === 0);
            const blocked = missing || protocol.allowed === false || tooFar;

            return (
              <div
                key={protocol.id}
                className={cx(
                  "mt-raise relative flex flex-col overflow-hidden rounded-xl p-3 transition-colors",
                  inProgress && "border-[var(--line-hot)]",
                  protocol.allowed === false && "opacity-60",
                )}
                style={inProgress ? { boxShadow: `0 0 26px -14px ${color}` } : undefined}
              >
                <div
                  className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full opacity-20 blur-2xl"
                  style={{ background: color }}
                />

                <div className="flex items-start gap-2.5">
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                    style={{ border: `1px solid ${color}`, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
                  >
                    <Icon className="h-4 w-4" style={{ color }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold leading-tight text-[var(--text)]">
                      {protocol.name}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <Chip color={protocol.cert === "ALS" ? "var(--crit)" : "var(--ok)"}>{protocol.cert}</Chip>
                      <span className="mt-num text-[9px] text-[var(--text-faint)]">{protocol.seconds}s</span>
                      {protocol.allowed === false ? <Chip color="var(--warn)">Not certified</Chip> : null}
                    </div>
                  </div>
                  {item ? (
                    <span
                      className="mt-inset grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg p-1.5"
                      style={{
                        backgroundImage:
                          "radial-gradient(70% 70% at 50% 35%, rgba(255,45,85,.18), rgba(0,0,0,0) 72%), linear-gradient(180deg, rgba(0,0,0,.45), rgba(255,116,168,.04))",
                      }}
                    >
                      <img
                        src={asset(`img/items/${item.id}.png`)}
                        alt=""
                        className="max-h-full max-w-full object-contain drop-shadow-[0_3px_8px_rgba(0,0,0,.7)]"
                      />
                    </span>
                  ) : null}
                </div>

                <p className="mt-2 min-h-[30px] flex-1 text-[10px] leading-relaxed text-[var(--text-faint)]">
                  {protocol.effect}
                </p>

                {item ? (
                  <div className="mt-num mb-2 flex items-center gap-1.5 text-[9px]">
                    <span className="text-[var(--text-faint)]">{item.label}</span>
                    <span
                      className="ml-auto"
                      style={{ color: carried === 0 ? "var(--crit)" : carried <= 2 ? "var(--warn)" : "var(--text-dim)" }}
                    >
                      {carried} carried
                    </span>
                  </div>
                ) : null}

                <Btn
                  size="sm"
                  variant={protocol.tone === "crit" ? "primary" : "ghost"}
                  icon={inProgress ? ListChecks : Icon}
                  disabled={blocked || inProgress}
                  onClick={() => start(protocol)}
                  className="w-full"
                >
                  {protocol.allowed === false
                    ? `${protocol.cert} only`
                    : missing
                      ? "Not in kit"
                      : tooFar
                        ? "Too far"
                        : inProgress
                          ? "Running"
                          : "Administer"}
                </Btn>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
