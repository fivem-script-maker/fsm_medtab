import { Activity, Ambulance, Clock, HeartPulse, Siren, TrendingUp } from "lucide-react";
import { asset, clock, cx, duration } from "../../lib/ui.js";
import { useMedtab } from "../../state/store.jsx";
import { Chip, Field, Meter, Panel, SectionTitle, StatTile } from "../ui/Kit.jsx";
import ECGMonitor from "../ECGMonitor.jsx";

const TONE = { crit: "var(--crit)", pink: "var(--pink)", warn: "var(--warn)", dim: "var(--text-faint)" };
const PRIORITY_COLOR = { 1: "var(--crit)", 2: "var(--warn)", 3: "var(--ok)" };

export default function OverviewPage({ onOpenCall, onOpenPatient }) {
  const { activity, calls, medic, patients, stats, tick, units } = useMedtab();

  // Every list below can legitimately arrive empty from the server — an idle
  // shift has no calls, no patients and no log lines — so nothing here indexes
  // into an array without checking that something is in it.
  const critical = patients.filter((patient) => patient.triage === "red");
  const focus = critical[0] || patients[0] || null;
  const onDuty = units.filter((unit) => unit.status !== "10-7");
  const hourly = stats.hourly || [];
  const peak = Math.max(...hourly, 1);
  const survival = stats.survivalRate || 0;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 sm:p-4">
      {/* ── Hero strip ─────────────────────────────────────────────────── */}
      <Panel className="relative shrink-0 overflow-hidden rounded-2xl">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url("${asset("img/ems-banner.jpg")}")`,
            backgroundSize: "cover",
            backgroundPosition: "center 55%",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(94deg, rgba(8,4,10,.96) 0%, rgba(8,4,10,.86) 44%, rgba(20,5,16,.48) 72%, rgba(255,45,85,.14) 100%)",
          }}
        />
        <div className="relative flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Chip color="var(--crit)" icon={Siren} className="mt-a-pulse">
                {calls.filter((call) => call.priority === 1).length} Priority 1 active
              </Chip>
              <Chip color="var(--pink)">{medic.station}</Chip>
            </div>
            <h1 className="mt-2.5 text-2xl font-bold uppercase leading-none tracking-[0.03em] text-[var(--text)] sm:text-3xl">
              Good watch, {(medic.name || "Medic").split(" ")[0]}
            </h1>
            <p className="mt-1.5 max-w-[52ch] text-[11.5px] leading-relaxed text-[var(--text-dim)]">
              {medic.callsign} on shift {duration((medic.shiftStartedSecondsAgo || 0) + tick)} · {onDuty.length} units
              deployed across Los Santos · {critical.length} patients tagged immediate.
            </p>
          </div>

          <div
            className="shrink-0 rounded-xl border border-[var(--line)] p-3 backdrop-blur-sm lg:w-[344px]"
            style={{ background: "linear-gradient(180deg, rgba(10,5,12,.82), rgba(18,10,19,.9))" }}
          >
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[var(--text-faint)]">
                Survival rate — shift
              </span>
              <span className="mt-num text-[11px] text-[var(--ok)]">
                {Math.round(survival * 100)}%
              </span>
            </div>
            <Meter value={survival * 100} color="var(--ok)" height={7} />
            <div className="mt-2.5 grid grid-cols-3 gap-2">
              {[
                ["Calls", stats.callsTaken],
                ["Treated", stats.patientsTreated],
                ["Transported", stats.transported],
              ].map(([label, value]) => (
                <div key={label} className="mt-inset rounded-lg px-2 py-1.5 text-center">
                  <div className="mt-num text-base leading-none text-[var(--text)]">{value}</div>
                  <div className="mt-1 truncate text-[8.5px] uppercase tracking-[0.1em] text-[var(--text-faint)]">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      {/* ── Stat row ───────────────────────────────────────────────────── */}
      <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Siren} label="Open calls" value={calls.length} sub={`${calls.filter((c) => (c.assigned || []).length === 0).length} unassigned`} color="var(--crit)" />
        <StatTile icon={HeartPulse} label="Active patients" value={patients.filter((p) => p.triage !== "black").length} sub={`${critical.length} immediate`} color="var(--pink)" />
        <StatTile icon={Clock} label="Avg response" value={clock(stats.avgResponseSeconds)} unit="min" sub="Target 4:00" color="var(--warn)" />
        <StatTile icon={Ambulance} label="Units on duty" value={onDuty.length} sub={`${units.length - onDuty.length} out of service`} color="var(--ok)" />
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      {/* The height constraint is xl-only on purpose. Below xl the columns
          stack into one grid track, and `min-h-0` there lets an over-constrained
          row collapse far below its content — the panel clips, but its inner
          wrapper still paints, straight over the panel underneath. Stacked, the
          panels take a definite height and the page itself scrolls. */}
      <div className="grid grid-cols-1 gap-3 roomy:min-h-[440px] roomy:flex-1 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 roomy:min-h-0">
          {/* critical patient watch */}
          <Panel hot className="flex h-[340px] flex-col overflow-hidden roomy:h-auto roomy:min-h-[250px] roomy:flex-[1.5]">
            <SectionTitle
              icon={HeartPulse}
              title="Critical watch"
              hint={`${critical.length} immediate`}
              right={focus ? <Chip color="var(--crit)">{focus.rhythm}</Chip> : null}
            />
            <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
              {!focus ? (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-center">
                  <HeartPulse size={22} className="text-[var(--text-faint)]" />
                  <p className="text-[11px] text-[var(--text-dim)]">No patient on the board</p>
                  <p className="max-w-[34ch] text-[9.5px] leading-relaxed text-[var(--text-faint)]">
                    Casualties appear here the moment a unit reports one down.
                  </p>
                </div>
              ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <div className="min-w-0 shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenPatient(focus.id)}
                    className="group block w-full text-left"
                  >
                    <p className="truncate text-base font-semibold text-[var(--text)] transition-colors group-hover:text-[var(--pink)]">
                      {focus.name}
                    </p>
                    <p className="mt-num mt-0.5 truncate text-[10px] text-[var(--text-faint)]">
                      {focus.id} · {focus.location} · {focus.complaint}
                    </p>
                  </button>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      ["HR", focus.vitals.hr, "bpm", "var(--crit)"],
                      ["BP", `${focus.vitals.sys}/${focus.vitals.dia}`, "mmHg", "var(--warn)"],
                      ["SpO₂", `${focus.vitals.spo2}`, "%", "var(--warn)"],
                      ["GCS", focus.vitals.gcs, "/15", "var(--crit)"],
                    ].map(([label, value, unit, color]) => (
                      <div key={label} className="mt-inset rounded-lg px-2 py-1.5">
                        <div className="text-[8.5px] uppercase tracking-[0.12em] text-[var(--text-faint)]">{label}</div>
                        <div className="mt-num mt-0.5 flex items-baseline gap-0.5 text-[13px] leading-none" style={{ color }}>
                          <span className="min-w-0 truncate">{value}</span>
                          <span className="shrink-0 text-[8px] text-[var(--text-faint)]">{unit}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <ECGMonitor
                  bpm={focus.vitals.hr}
                  rhythm={focus.rhythm === "Asystole" ? "asystole" : "sinus"}
                  className="min-h-[92px] w-full flex-1"
                />
              </div>
              )}
            </div>
          </Panel>

          {/* shift throughput */}
          <Panel className="flex h-[272px] shrink-0 flex-col overflow-hidden roomy:h-auto roomy:min-h-[170px] roomy:shrink roomy:flex-1">
            <SectionTitle
              icon={TrendingUp}
              title="Calls per hour"
              hint="This shift"
              right={<span className="mt-num text-[10px] text-[var(--text-faint)]">peak {peak}/h</span>}
            />
            <div className="flex min-h-0 flex-1 items-stretch gap-2 px-4 pb-4">
              {hourly.map((count, index) => (
                <div key={index} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                  <span className="mt-num text-[9px] text-[var(--text-faint)]">{count}</span>
                  <div className="mt-inset mx-auto flex w-full min-h-0 max-w-[52px] flex-1 items-end overflow-hidden rounded-md">
                    <div
                      className="w-full rounded-md transition-[height] duration-500"
                      style={{
                        height: `${Math.max(6, (count / peak) * 100)}%`,
                        background:
                          count >= peak
                            ? "linear-gradient(180deg, var(--pink), var(--crit))"
                            : "linear-gradient(180deg, rgba(255,116,168,.55), rgba(255,45,85,.25))",
                        boxShadow: count >= peak ? "0 0 16px -4px var(--crit)" : "none",
                      }}
                    />
                  </div>
                  <span className="mt-num text-[8px] text-[var(--text-faint)]">
                    -{hourly.length - index}h
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-3 roomy:min-h-0">
          {/* priority queue */}
          <Panel className="flex h-[340px] flex-col overflow-hidden roomy:h-auto roomy:min-h-[220px] roomy:flex-[1.6]">
            <SectionTitle icon={Siren} title="Priority queue" hint={`${calls.length} open`} />
            <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2 pb-3">
              {calls.length === 0 && (
                <li className="px-2.5 py-6 text-center text-[10.5px] text-[var(--text-faint)]">
                  Board clear — no open calls.
                </li>
              )}
              {[...calls]
                .sort((a, b) => a.priority - b.priority || b.openedSecondsAgo - a.openedSecondsAgo)
                .map((call) => (
                  <li key={call.id}>
                    <button
                      type="button"
                      onClick={() => onOpenCall(call.id)}
                      className="mt-raise group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:border-[var(--line-hot)]"
                    >
                      <span
                        className="h-8 w-[3px] shrink-0 rounded-full"
                        style={{ background: PRIORITY_COLOR[call.priority], boxShadow: `0 0 10px -1px ${PRIORITY_COLOR[call.priority]}` }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11.5px] font-semibold text-[var(--text)]">{call.type}</p>
                        <p className="truncate text-[9.5px] text-[var(--text-faint)]">{call.street}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="mt-num text-[10.5px]" style={{ color: PRIORITY_COLOR[call.priority] }}>
                          {clock(call.openedSecondsAgo + tick)}
                        </p>
                        <p className="mt-num text-[8.5px] text-[var(--text-faint)]">
                          {(call.assigned || []).length ? call.assigned[0] : "UNASSIGNED"}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
            </ul>
          </Panel>

          {/* activity feed */}
          <Panel className="flex h-[240px] flex-col overflow-hidden roomy:h-auto roomy:min-h-[150px] roomy:flex-1">
            <SectionTitle icon={Activity} title="Station log" />
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-3">
              {(activity || []).length === 0 && (
                <li className="py-6 text-center text-[10.5px] text-[var(--text-faint)]">
                  Log is quiet.
                </li>
              )}
              {(activity || []).map((entry, index) => (
                <li key={index} className="flex gap-2.5">
                  <span className="mt-num shrink-0 pt-[1px] text-[9px] text-[var(--text-faint)]">{entry.t}</span>
                  <span
                    className="mt-[5px] h-1 w-1 shrink-0 rounded-full"
                    style={{ background: TONE[entry.tone], boxShadow: `0 0 6px 0 ${TONE[entry.tone]}` }}
                  />
                  <span className={cx("text-[10.5px] leading-snug", entry.tone === "dim" ? "text-[var(--text-faint)]" : "text-[var(--text-dim)]")}>
                    {entry.text}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel className="shrink-0 px-4 py-2.5">
            <Field label="Medical control" value="Dr. Ilona Vance" />
            <Field label="Receiving facility" value="Pillbox Hill — Trauma" />
            <Field label="Shift revenue" value={`$${(stats.revenue || 0).toLocaleString()}`} mono color="var(--ok)" />
          </Panel>
        </div>
      </div>
    </div>
  );
}
