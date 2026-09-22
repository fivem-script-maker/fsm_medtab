import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Ambulance,
  Crosshair,
  Navigation,
  Phone,
  Search,
  ShieldCheck,
  Siren,
  Timer,
  TriangleAlert,
  Users,
} from "lucide-react";
import { clock, cx } from "../../lib/ui.js";
import { useMedtab } from "../../state/store.jsx";
import { Btn, Chip, Empty, Field, Panel, SectionTitle } from "../ui/Kit.jsx";
import DispatchMap from "../DispatchMap.jsx";

const PRIORITY = {
  1: { color: "var(--crit)", label: "Priority 1", note: "Immediate life threat" },
  2: { color: "var(--warn)", label: "Priority 2", note: "Urgent, not life threat" },
  3: { color: "var(--ok)", label: "Priority 3", note: "Routine response" },
};

/* The trail is driven by the call's own `stage`, which only the server sets —
   nothing here guesses a stage from how old the call is. */
const STAGES = [
  { key: "received", label: "Call received", color: "var(--crit)" },
  { key: "dispatched", label: "Units dispatched", color: "var(--crit)" },
  { key: "enroute", label: "En route", color: "var(--pink)" },
  { key: "onscene", label: "On scene", color: "var(--warn)" },
];

const isMine = (call, medic) =>
  call.mine === true || (call.assigned || []).includes(medic.callsign);

export default function DispatchPage({ selectedCallId, onSelectCall }) {
  const { calls, callAction, map, medic, setWaypoint, tick, units } = useMedtab();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  const filtered = calls.filter((call) => {
    if (filter === "mine" && !isMine(call, medic)) return false;
    if (filter === "open" && (call.assigned || []).length > 0) return false;
    if (!query.trim()) return true;
    const haystack = `${call.id} ${call.type} ${call.street} ${call.district} ${call.postal}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  const selected = calls.find((call) => call.id === selectedCallId) || filtered[0] || null;
  const priority = selected ? PRIORITY[selected.priority] || PRIORITY[3] : null;
  const stageIndex = selected ? STAGES.findIndex((stage) => stage.key === selected.stage) : -1;

  return (
    <div className="grid h-full grid-cols-1 gap-3 overflow-y-auto p-3 sm:p-4 xl:grid-cols-[minmax(320px,1fr)_minmax(0,1.15fr)]">
      {/* ── Call list ───────────────────────────────────────────────────── */}
      <Panel className="flex h-[420px] flex-col overflow-hidden roomy:h-auto roomy:min-h-0">
        <SectionTitle
          icon={Siren}
          title="Active calls"
          hint={`${filtered.length}/${calls.length}`}
          right={
            <span className="mt-num flex items-center gap-1 text-[9px] text-[var(--text-faint)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--crit)] mt-a-pulse" />
              LIVE
            </span>
          }
        />

        <div className="flex shrink-0 flex-col gap-2 px-3 pb-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-faint)]" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search call, street or postal…"
              aria-label="Search calls"
              className="mt-field h-8 w-full rounded-lg pl-8 pr-2.5 text-[11px]"
            />
          </div>
          <div className="flex gap-1.5">
            {[
              ["all", "All"],
              ["mine", "Mine"],
              ["open", "Unassigned"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cx(
                  "mt-btn h-6 flex-1 rounded-md text-[9px] font-semibold uppercase tracking-[0.14em]",
                  filter === key && "border-[var(--line-hot)] text-[var(--pink)]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
          {filtered.length === 0 ? (
            <li>
              <Empty icon={Search} title="No matching calls" hint="Clear the search or switch the filter above." />
            </li>
          ) : null}

          {filtered.map((call) => {
            const tone = PRIORITY[call.priority] || PRIORITY[3];
            const isSelected = selected && call.id === selected.id;
            const mine = isMine(call, medic);
            return (
              <li key={call.id}>
                <button
                  type="button"
                  onClick={() => onSelectCall(call.id)}
                  aria-pressed={isSelected}
                  className={cx(
                    "mt-raise relative block w-full overflow-hidden rounded-xl p-2.5 text-left transition-all duration-200",
                    isSelected ? "border-[var(--line-hot)]" : "hover:border-[var(--line-hot)]",
                  )}
                  style={isSelected ? { boxShadow: `0 0 26px -12px ${tone.color}` } : undefined}
                >
                  {/* priority stripe */}
                  <span
                    className={cx("absolute inset-y-0 left-0 w-[3px]", call.priority === 1 && "mt-stripes")}
                    style={call.priority === 1 ? undefined : { background: tone.color }}
                  />

                  <div className="flex items-start gap-2 pl-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="mt-num text-[9px] text-[var(--text-faint)]">{call.id}</span>
                        <Chip color={tone.color}>{call.code}</Chip>
                        {mine ? <Chip color="var(--pink)">Mine</Chip> : null}
                        {(call.assigned || []).length === 0 ? <Chip color="var(--warn)">Unassigned</Chip> : null}
                      </div>
                      <p className="mt-1 truncate text-[12.5px] font-semibold text-[var(--text)]">{call.type}</p>
                      <p className="truncate text-[10px] text-[var(--text-dim)]">{call.street}</p>
                      <p className="mt-num mt-0.5 truncate text-[9px] text-[var(--text-faint)]">
                        {call.district} · postal {call.postal} · {call.patients} patient
                        {call.patients > 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div
                        className="mt-num text-[13px] leading-none"
                        style={{ color: call.priority === 1 ? "var(--crit)" : "var(--text-dim)" }}
                      >
                        {clock(call.openedSecondsAgo + tick)}
                      </div>
                      <div className="mt-1 flex items-center justify-end gap-1 text-[8.5px] uppercase tracking-[0.12em] text-[var(--text-faint)]">
                        <Timer className="h-2.5 w-2.5" />
                        elapsed
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      {/* ── Map + detail ────────────────────────────────────────────────── */}
      <div className="flex h-[540px] flex-col gap-3 roomy:h-auto roomy:min-h-0">
        <DispatchMap
          calls={calls}
          units={units}
          selectedId={selected ? selected.id : null}
          onSelect={onSelectCall}
          tileUrl={map.tileUrl}
          className="h-[200px] shrink-0 sm:h-[240px] xl:h-[320px]"
        />

        <Panel hot={Boolean(selected && selected.priority === 1)} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <AnimatePresence mode="wait">
            {selected ? (
              <motion.div
                key={selected.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <SectionTitle
                  icon={Crosshair}
                  title={selected.type}
                  hint={selected.id}
                  right={<Chip color={priority.color}>{priority.label}</Chip>}
                />

                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-faint)]">{priority.note}</p>

                  <div className="mt-inset mt-2.5 rounded-lg p-3">
                    <p className="text-[11.5px] leading-relaxed text-[var(--text-dim)]">{selected.notes}</p>
                  </div>

                  <div className="mt-3 grid gap-x-5 sm:grid-cols-2">
                    <div>
                      <Field label="Location" value={selected.street} />
                      <Field label="District" value={selected.district} />
                      <Field label="Postal" value={selected.postal} mono />
                      <Field label="Elapsed" value={clock(selected.openedSecondsAgo + tick)} mono color={priority.color} />
                    </div>
                    <div>
                      <Field label="Caller" value={selected.caller} />
                      <Field label="Callback" value={selected.callerPhone} mono />
                      <Field label="Patients" value={selected.patients} mono />
                      <Field
                        label="Scene safety"
                        value={selected.pdOnScene ? "PD on scene — secured" : "Unverified"}
                        color={selected.pdOnScene ? "var(--ok)" : "var(--warn)"}
                      />
                    </div>
                  </div>

                  <div className="mt-hair my-3" />

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">
                      <Users className="h-3 w-3" />
                      Assigned
                    </span>
                    {(selected.assigned || []).length === 0 ? (
                      <Chip color="var(--warn)" icon={TriangleAlert}>
                        No unit responding
                      </Chip>
                    ) : (
                      (selected.assigned || []).map((unit) => (
                        <Chip key={unit} color={unit === medic.callsign ? "var(--pink)" : "var(--text-dim)"} icon={Ambulance}>
                          {unit}
                        </Chip>
                      ))
                    )}
                  </div>

                  <div className="mt-hair my-3" />

                  {/* Dispatch trail — lit from the call's server-side stage. */}
                  <p className="mb-2 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">
                    <Timer className="h-3 w-3" />
                    Dispatch trail
                  </p>
                  <ol className="relative ml-1 border-l border-[var(--line-2)] pl-3.5">
                    {STAGES.map((stage, index) => {
                      const reached = index <= stageIndex;
                      return (
                        <li key={stage.label} className="relative pb-2.5 last:pb-0">
                          <span
                            className="absolute -left-[18px] top-[3px] h-2 w-2 rounded-full border"
                            style={{
                              background: reached ? stage.color : "transparent",
                              borderColor: reached ? stage.color : "var(--line-2)",
                              boxShadow: reached ? `0 0 8px -1px ${stage.color}` : "none",
                            }}
                          />
                          <p
                            className="text-[10.5px] font-semibold"
                            style={{ color: reached ? "var(--text)" : "var(--text-faint)" }}
                          >
                            {stage.label}
                          </p>
                          <p className="mt-num text-[9px] text-[var(--text-faint)]">
                            {reached ? "done" : "pending"}
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2 border-t border-[var(--line-2)] p-3">
                  <Btn variant="primary" icon={Navigation} onClick={() => callAction(selected.id, "enroute")}>
                    Respond
                  </Btn>
                  <Btn icon={ShieldCheck} onClick={() => callAction(selected.id, "onscene")}>
                    On scene
                  </Btn>
                  <Btn icon={Phone} onClick={() => callAction(selected.id, "contact")}>
                    Call back
                  </Btn>
                  <Btn
                    icon={Crosshair}
                    onClick={() => selected.world && setWaypoint(selected.world.x, selected.world.y)}
                  >
                    Waypoint
                  </Btn>
                  <Btn icon={Siren} className="ml-auto" onClick={() => callAction(selected.id, "clear")}>
                    Clear call
                  </Btn>
                </div>
              </motion.div>
            ) : (
              <Empty
                key="empty"
                icon={Crosshair}
                title="No call selected"
                hint="Pick a call from the list or a pin on the map to see the full dispatch record."
              />
            )}
          </AnimatePresence>
        </Panel>
      </div>
    </div>
  );
}
