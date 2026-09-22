import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Brain,
  ClipboardList,
  Droplet,
  HeartPulse,
  ScanLine,
  Search,
  Thermometer,
  TriangleAlert,
  Wind,
} from "lucide-react";
import { clamp, cx, seeded, STATE_COLOR, TRIAGE, vitalState } from "../../lib/ui.js";
import { useMedtab } from "../../state/store.jsx";
import { Avatar, Chip, Empty, Field, Meter, Panel, SectionTitle } from "../ui/Kit.jsx";
import BodyMap, { SEVERITY } from "../BodyMap.jsx";
import ECGMonitor from "../ECGMonitor.jsx";
import Sparkline from "../Sparkline.jsx";

const TRIAGE_ORDER = { red: 0, yellow: 1, green: 2, black: 3 };

/** Preview-only drift so the monitor reads as live without a server behind it.
    In game the vitals in the payload ARE the truth and are shown untouched. */
function drift(base, tick, amount, seed) {
  if (!base) return base || 0;
  return Math.round(base + Math.sin(tick / 2.7 + seed) * amount);
}

/** Stable per-patient seed — the ids are alphanumeric, not plain numbers. */
function seedOf(id) {
  let total = 0;
  for (let i = 0; i < String(id).length; i += 1) total += String(id).charCodeAt(i);
  return total || 1;
}

function VitalTile({ icon: Icon, label, value, unit, state, trend, seed, wide = false }) {
  const color = STATE_COLOR[state];
  return (
    <div className={cx("mt-panel relative overflow-hidden rounded-xl p-2.5", wide && "col-span-2")}>
      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3 shrink-0" style={{ color }} />
        <span className="truncate text-[8.5px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">
          {label}
        </span>
        {state !== "ok" ? (
          <span
            className={cx("ml-auto h-1.5 w-1.5 shrink-0 rounded-full", state === "crit" && "mt-a-pulse")}
            style={{ background: color, boxShadow: `0 0 8px 0 ${color}` }}
          />
        ) : null}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="mt-num text-xl leading-none" style={{ color }}>
          {value}
        </span>
        <span className="text-[9px] text-[var(--text-faint)]">{unit}</span>
      </div>
      {trend ? <Sparkline values={trend} color={color} height={22} id={seed} className="mt-1.5" /> : null}
    </div>
  );
}

export default function PatientsPage({ selectedPatientId, onSelectPatient }) {
  const { live: isLive, patients, tick } = useMedtab();
  const [query, setQuery] = useState("");
  const [triageFilter, setTriageFilter] = useState("all");
  const [injuryId, setInjuryId] = useState(null);

  const roster = useMemo(
    () =>
      patients.filter((patient) => {
        if (triageFilter !== "all" && patient.triage !== triageFilter) return false;
        if (!query.trim()) return true;
        const haystack = `${patient.name} ${patient.id} ${patient.complaint} ${patient.location}`.toLowerCase();
        return haystack.includes(query.trim().toLowerCase());
      }).sort((a, b) => TRIAGE_ORDER[a.triage] - TRIAGE_ORDER[b.triage]),
    [patients, query, triageFilter],
  );

  const patient = patients.find((entry) => entry.id === selectedPatientId) || roster[0] || null;
  const triage = patient ? TRIAGE[patient.triage] || TRIAGE.green : null;
  const injuries = patient ? patient.injuries || [] : [];
  const timeline = patient ? patient.timeline || [] : [];
  const vitals = patient ? patient.vitals || {} : {};

  const injury = injuries.find((entry) => entry.id === injuryId) || injuries[0] || null;

  /* Live: the server's own numbers. Preview: gentle drift so the ECG moves. */
  const reading = patient
    ? isLive
      ? { hr: vitals.hr || 0, sys: vitals.sys || 0, dia: vitals.dia || 0, spo2: vitals.spo2 || 0, rr: vitals.rr || 0 }
      : {
          hr: drift(vitals.hr, tick, 3, 0),
          sys: drift(vitals.sys, tick, 4, 1.4),
          dia: drift(vitals.dia, tick, 3, 2.1),
          spo2: vitals.spo2 ? clamp(drift(vitals.spo2, tick, 1, 3.3), 0, 100) : 0,
          rr: drift(vitals.rr, tick, 1, 4.2),
        }
    : null;

  const trends = useMemo(() => {
    if (!patient) return null;
    const seed = seedOf(patient.id);
    const v = patient.vitals || {};
    const hr = v.hr || 0;
    const sys = v.sys || 0;
    const spo2 = v.spo2 || 0;
    const rr = v.rr || 0;
    const temp = typeof v.temp === "number" ? v.temp : 36.8;
    return {
      hr: seeded(seed, 22, hr * 0.93, hr * 1.07),
      bp: seeded(seed + 7, 22, sys * 0.94, sys * 1.06),
      spo2: seeded(seed + 13, 22, Math.max(0, spo2 - 3), Math.min(100, spo2 + 2)),
      rr: seeded(seed + 21, 22, rr * 0.9, rr * 1.1),
      temp: seeded(seed + 29, 22, temp - 0.4, temp + 0.3),
    };
  }, [patient]);

  return (
    <div className="grid h-full grid-cols-1 gap-3 overflow-y-auto p-3 sm:p-4 xl:grid-cols-[236px_minmax(0,1.35fr)_minmax(0,1fr)]">
      {/* ── Roster ──────────────────────────────────────────────────────── */}
      <Panel className="flex h-[360px] flex-col overflow-hidden roomy:h-auto roomy:min-h-0">
        <SectionTitle icon={ClipboardList} title="Patients" hint={`${roster.length}`} />
        <div className="shrink-0 space-y-2 px-3 pb-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-faint)]" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, ID, complaint…"
              aria-label="Search patients"
              className="mt-field h-8 w-full rounded-lg pl-8 pr-2.5 text-[11px]"
            />
          </div>
          <div className="flex gap-1">
            {["all", "red", "yellow", "green", "black"].map((key) => {
              const active = triageFilter === key;
              const color = key === "all" ? "var(--pink)" : TRIAGE[key].color;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTriageFilter(key)}
                  title={key === "all" ? "All patients" : TRIAGE[key].desc}
                  aria-pressed={active}
                  className="mt-btn h-6 flex-1 rounded-md text-[9px] font-bold uppercase"
                  style={
                    active
                      ? { color, borderColor: color, background: `color-mix(in srgb, ${color} 15%, transparent)` }
                      : undefined
                  }
                >
                  {key === "all" ? "All" : TRIAGE[key].short}
                </button>
              );
            })}
          </div>
        </div>

        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2.5 pb-3">
          {roster.length === 0 ? (
            <li>
              <Empty icon={Search} title="No patients" hint="Nothing matches that search or triage filter." />
            </li>
          ) : null}
          {roster.map((entry) => {
            const tone = TRIAGE[entry.triage];
            const active = patient && entry.id === patient.id;
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelectPatient(entry.id);
                    setInjuryId(null);
                  }}
                  aria-pressed={active}
                  className={cx(
                    "mt-raise relative flex w-full items-center gap-2.5 overflow-hidden rounded-lg py-2 pl-3 pr-2.5 text-left transition-colors",
                    active ? "border-[var(--line-hot)]" : "hover:border-[var(--line-hot)]",
                  )}
                  style={active ? { boxShadow: `0 0 24px -14px ${tone.color}` } : undefined}
                >
                  <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: tone.color }} />
                  <Avatar name={entry.name} size={30} color={tone.color} ring={active} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11.5px] font-semibold text-[var(--text)]">{entry.name}</p>
                    <p className="truncate text-[9px] text-[var(--text-faint)]">{entry.complaint}</p>
                  </div>
                  <span
                    className="mt-num shrink-0 rounded px-1 py-0.5 text-[8.5px] font-bold"
                    style={{ color: tone.color, border: `1px solid ${tone.color}` }}
                  >
                    {tone.short}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      {/* ── Chart ───────────────────────────────────────────────────────── */}
      {patient ? (
        <>
          <div className="flex flex-col gap-3 roomy:min-h-0">
            {/* header */}
            <Panel hot={patient.triage === "red"} className="relative shrink-0 overflow-hidden">
              <span
                className="absolute inset-x-0 top-0 h-[2px]"
                style={{ background: triage.color, boxShadow: `0 0 16px 0 ${triage.color}` }}
              />
              <div className="flex flex-wrap items-start gap-3 p-4">
                <Avatar name={patient.name} size={50} color={triage.color} ring />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-lg font-semibold leading-none text-[var(--text)]">{patient.name}</h2>
                    <Chip color={triage.color}>
                      {triage.short} · {triage.label}
                    </Chip>
                    {!patient.conscious ? (
                      <Chip color="var(--crit)" icon={TriangleAlert}>
                        Unresponsive
                      </Chip>
                    ) : null}
                  </div>
                  <p className="mt-num mt-1 truncate text-[10px] text-[var(--text-faint)]">
                    {patient.id} · {patient.age ? `${patient.age}y` : "age unknown"} {patient.sex} · DOB {patient.dob} ·{" "}
                    {patient.weightKg}kg
                  </p>
                  <p className="mt-1.5 truncate text-[11.5px] text-[var(--text-dim)]">{patient.complaint}</p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="mt-num text-2xl leading-none" style={{ color: triage.color }}>
                    {patient.blood}
                  </div>
                  <div className="text-[8.5px] uppercase tracking-[0.16em] text-[var(--text-faint)]">Blood type</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--line-2)] px-4 py-2">
                <span className="text-[8.5px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">
                  Allergies
                </span>
                {(patient.allergies || []).length === 0 ? (
                  <Chip color="var(--ok)">None known</Chip>
                ) : (
                  (patient.allergies || []).map((allergy) => (
                    <Chip key={allergy} color="var(--crit)" icon={TriangleAlert}>
                      {allergy}
                    </Chip>
                  ))
                )}
                {(patient.conditions || []).map((condition) => (
                  <Chip key={condition} color="var(--text-dim)">
                    {condition}
                  </Chip>
                ))}
              </div>
            </Panel>

            {/* monitor */}
            <Panel className="shrink-0 overflow-hidden">
              <SectionTitle
                icon={Activity}
                title="Cardiac monitor"
                hint="Lead II"
                right={
                  <span className="mt-num text-[10px]" style={{ color: vitals.hr ? "var(--crit)" : "var(--text-faint)" }}>
                    {patient.rhythm}
                  </span>
                }
              />
              <div className="px-4 pb-4">
                <ECGMonitor
                  bpm={reading.hr || 60}
                  rhythm={patient.rhythm === "Asystole" ? "asystole" : "sinus"}
                  color={patient.triage === "black" ? "#7e8794" : "#ff2d55"}
                  className="h-[104px] w-full"
                  ariaLabel={`Cardiac monitor for ${patient.name}, ${patient.rhythm}`}
                />
              </div>
            </Panel>

            {/* vitals */}
            <div className="grid shrink-0 grid-cols-2 gap-2.5 sm:grid-cols-3">
              <VitalTile icon={HeartPulse} label="Heart rate" value={reading.hr} unit="bpm" state={vitalState("hr", reading.hr)} trend={trends.hr} seed="hr" />
              <VitalTile icon={Droplet} label="Blood pressure" value={`${reading.sys}/${reading.dia}`} unit="mmHg" state={vitalState("sys", reading.sys)} trend={trends.bp} seed="bp" />
              <VitalTile icon={Wind} label="SpO₂" value={reading.spo2} unit="%" state={vitalState("spo2", reading.spo2)} trend={trends.spo2} seed="spo2" />
              <VitalTile icon={Activity} label="Resp rate" value={reading.rr} unit="/min" state={vitalState("rr", reading.rr)} trend={trends.rr} seed="rr" />
              <VitalTile icon={Thermometer} label="Temp" value={(vitals.temp || 0).toFixed(1)} unit="°C" state={vitalState("temp", vitals.temp || 0)} trend={trends.temp} seed="temp" />
              <VitalTile icon={Brain} label="GCS" value={vitals.gcs || 0} unit="/15" state={vitalState("gcs", vitals.gcs || 0)} seed="gcs" />
            </div>

            {/* blood loss + timeline */}
            <Panel className="shrink-0 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">
                  Estimated blood loss
                </span>
                <span className="mt-num text-[11px]" style={{ color: (vitals.bloodLossPct || 0) > 30 ? "var(--crit)" : "var(--text-dim)" }}>
                  {(vitals.bloodLossPct || 0)}%
                </span>
              </div>
              <Meter value={(vitals.bloodLossPct || 0)} color={(vitals.bloodLossPct || 0) > 30 ? "var(--crit)" : "var(--pink)"} className="mt-1.5" />
            </Panel>

            <Panel className="flex h-[260px] flex-col overflow-hidden roomy:h-auto roomy:min-h-[150px] roomy:flex-1">
              <SectionTitle icon={ClipboardList} title="Care timeline" hint={`${timeline.length} entries`} />
              <ul className="min-h-0 flex-1 space-y-0 overflow-y-auto px-4 pb-3">
                {timeline.map((entry, index) => (
                  <li key={index} className="relative flex gap-3 pb-3 pl-1 last:pb-0">
                    {index < timeline.length - 1 ? (
                      <span className="absolute left-[10px] top-[14px] h-full w-px bg-[var(--line)]" />
                    ) : null}
                    <span
                      className="relative mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full"
                      style={{
                        background: entry.kind === "treat" ? "var(--crit)" : entry.kind === "assess" ? "var(--pink)" : "var(--text-faint)",
                        boxShadow: entry.kind === "treat" ? "0 0 10px 0 var(--crit)" : "none",
                        marginLeft: 3.5,
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] text-[var(--text-dim)]">{entry.label}</p>
                      <p className="mt-num truncate text-[9px] text-[var(--text-faint)]">
                        {entry.t} · {entry.by}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          {/* ── Injury chart ──────────────────────────────────────────────── */}
          <div className="flex flex-col gap-3 roomy:min-h-0">
            <Panel className="flex h-[420px] flex-col overflow-hidden roomy:h-auto roomy:min-h-[380px] roomy:flex-1">
              <SectionTitle
                icon={ScanLine}
                title="Injury chart"
                hint={`${injuries.length} logged`}
                right={
                  <span className="text-[8.5px] uppercase tracking-[0.14em] text-[var(--text-faint)]">Tap a marker</span>
                }
              />
              <div className="min-h-0 flex-1">
                <BodyMap
                  injuries={injuries}
                  selectedId={injury ? injury.id : null}
                  onSelect={(entry) => setInjuryId(entry.id)}
                />
              </div>
            </Panel>

            <Panel className="shrink-0 overflow-hidden">
              <AnimatePresence mode="wait">
                {injury ? (
                  <motion.div
                    key={`${patient.id}-${injury.id}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.18 }}
                  >
                    <SectionTitle
                      icon={TriangleAlert}
                      title={injury.region}
                      right={
                        <Chip color={(SEVERITY[injury.severity] || SEVERITY.minor).color}>{(SEVERITY[injury.severity] || SEVERITY.minor).label}</Chip>
                      }
                    />
                    <div className="px-4 pb-3.5">
                      <p className="text-[12px] font-semibold text-[var(--text)]">{injury.label}</p>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-dim)]">{injury.note}</p>
                    </div>
                  </motion.div>
                ) : (
                  <Empty key="no-injury" icon={ScanLine} title="No injuries logged" />
                )}
              </AnimatePresence>
            </Panel>

            <Panel className="shrink-0 overflow-hidden">
              <SectionTitle icon={ClipboardList} title="Field notes" />
              <div className="px-4 pb-3.5">
                <p className="text-[11px] leading-relaxed text-[var(--text-dim)]">{patient.notes}</p>
                <div className="mt-hair my-3" />
                <Field label="Status" value={patient.status} />
                <Field label="Linked call" value={patient.callId || "—"} mono />
                <Field label="Location" value={patient.location} />
                {typeof patient.distance === "number" ? (
                  <Field label="Distance" value={`${patient.distance}m`} mono color={patient.distance > 4 ? "var(--warn)" : "var(--ok)"} />
                ) : null}
                <Field label="Insurance" value={patient.insurance} />
              </div>
            </Panel>
          </div>
        </>
      ) : (
        <Panel className="xl:col-span-2">
          <Empty icon={ClipboardList} title="No patient selected" hint="Choose someone from the roster on the left." />
        </Panel>
      )}
    </div>
  );
}
