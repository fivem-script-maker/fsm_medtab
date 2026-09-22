import { Ambulance, Fuel, MapPin, Radio, ShieldCheck, Users } from "lucide-react";
import { cx } from "../../lib/ui.js";
import { useMedtab } from "../../state/store.jsx";
import { Avatar, Btn, Chip, Field, Meter, Panel, SectionTitle } from "../ui/Kit.jsx";

const TONE = { ok: "var(--ok)", warn: "var(--warn)", crit: "var(--crit)", dim: "var(--text-faint)" };

export default function UnitsPage() {
  const { medic, pageUnit, roster, unitStatuses, units } = useMedtab();
  const statusOf = (code) =>
    unitStatuses.find((entry) => entry.code === code) || unitStatuses[0] || { code, tone: "dim" };
  const onDuty = units.filter((unit) => unit.status !== "10-7");
  const avgFuel = Math.round(
    onDuty.reduce((sum, unit) => sum + (unit.fuel || 0), 0) / Math.max(onDuty.length, 1),
  );

  return (
    <div className="grid h-full grid-cols-1 gap-3 overflow-y-auto p-3 sm:p-4 xl:grid-cols-[minmax(0,1fr)_290px]">
      {/* ── Fleet ───────────────────────────────────────────────────────── */}
      <Panel className="flex h-[460px] flex-col overflow-hidden roomy:h-auto roomy:min-h-0">
        <SectionTitle
          icon={Ambulance}
          title="Fleet status"
          hint={`${onDuty.length} deployed`}
          right={
            <span className="mt-num flex items-center gap-1 text-[9px] text-[var(--text-faint)]">
              <span className="mt-a-pulse h-1.5 w-1.5 rounded-full bg-[var(--ok)]" />
              TELEMETRY
            </span>
          }
        />

        {/* Aggregate read-out — everything here is derived from the fleet list
            below, so the two can never drift apart. */}
        <div className="grid shrink-0 grid-cols-2 gap-2 px-3 pb-3 sm:grid-cols-4">
          {[
            ["Deployed", `${onDuty.length}/${units.length}`, "var(--ok)"],
            ["On scene", `${units.filter((unit) => unit.status === "10-23").length}`, "var(--crit)"],
            ["Avg fuel", `${avgFuel}%`, "var(--warn)"],
            ["Crew out", `${units.reduce((sum, unit) => sum + (unit.crew || []).length, 0)}`, "var(--pink)"],
          ].map(([label, value, color]) => (
            <div key={label} className="mt-inset rounded-lg px-2.5 py-2">
              <div className="truncate text-[8.5px] uppercase tracking-[0.14em] text-[var(--text-faint)]">{label}</div>
              <div className="mt-num mt-1 text-[15px] leading-none" style={{ color }}>{value}</div>
            </div>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-2.5 overflow-y-auto px-3 pb-3 lg:grid-cols-2 2xl:grid-cols-3">
          {units.length === 0 ? (
            <p className="col-span-full py-8 text-center text-[10.5px] text-[var(--text-faint)]">
              No unit is signed on right now.
            </p>
          ) : null}
          {units.map((unit) => {
            const status = statusOf(unit.status);
            const tone = TONE[status.tone];
            const offline = unit.status === "10-7";

            return (
              <article
                key={unit.callsign}
                className={cx(
                  "mt-raise relative flex flex-col overflow-hidden rounded-xl p-3",
                  unit.mine && "border-[var(--line-hot)]",
                  offline && "opacity-65",
                )}
                style={unit.mine ? { boxShadow: "0 0 30px -16px var(--crit)" } : undefined}
              >
                <span className="absolute inset-x-0 top-0 h-[2px]" style={{ background: tone }} />

                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="mt-num truncate text-[13px] font-bold tracking-[0.06em] text-[var(--text)]">
                        {unit.callsign}
                      </h3>
                      {unit.mine ? <Chip color="var(--pink)">You</Chip> : null}
                    </div>
                    <p className="mt-0.5 truncate text-[10px] text-[var(--text-dim)]">{unit.vehicleLabel}</p>
                  </div>
                  <Chip color={tone}>
                    <span className="mt-num">{unit.status}</span>
                  </Chip>
                </div>

                <div className="mt-inset mt-2.5 rounded-lg px-2.5 py-1.5">
                  <Field label="Model" value={unit.vehicleModel || "—"} mono />
                  <Field label="Hash" value={unit.vehicleHash || "—"} mono />
                  <Field label="Plate" value={unit.plate} mono />
                </div>

                <div className="mt-2 flex items-start gap-1.5">
                  <MapPin className="mt-[2px] h-3 w-3 shrink-0 text-[var(--text-faint)]" />
                  <p className="min-w-0 flex-1 text-[10px] leading-snug text-[var(--text-dim)]">{unit.location}</p>
                </div>

                <div className="mt-2 flex items-center gap-1.5">
                  <Users className="h-3 w-3 shrink-0 text-[var(--text-faint)]" />
                  <p className="min-w-0 flex-1 truncate text-[10px] text-[var(--text-dim)]">
                    {(unit.crew || []).length ? unit.crew.join(" · ") : "No crew assigned"}
                  </p>
                </div>

                <div className="mt-2.5 flex items-center gap-2">
                  <Fuel className="h-3 w-3 shrink-0 text-[var(--text-faint)]" />
                  <Meter
                    value={unit.fuel || 0}
                    color={(unit.fuel || 0) < 25 ? "var(--crit)" : (unit.fuel || 0) < 50 ? "var(--warn)" : "var(--ok)"}
                    height={4}
                    ticks={false}
                    className="flex-1"
                  />
                  <span className="mt-num shrink-0 text-[9px] text-[var(--text-faint)]">
                    {unit.fuel === null || unit.fuel === undefined ? "—" : `${unit.fuel}%`}
                  </span>
                </div>

                <div className="mt-2.5 flex items-center gap-2 border-t border-[var(--line-2)] pt-2.5">
                  <span className="mt-num min-w-0 flex-1 truncate text-[9px] text-[var(--text-faint)]">
                    {unit.assignedCall ? `Assigned ${unit.assignedCall}` : "No active assignment"}
                  </span>
                  <Btn
                    size="sm"
                    icon={Radio}
                    disabled={offline || unit.mine}
                    onClick={() => pageUnit(unit.callsign)}
                  >
                    Hail
                  </Btn>
                </div>
              </article>
            );
          })}
        </div>
      </Panel>

      {/* ── Roster ──────────────────────────────────────────────────────── */}
      <Panel className="flex h-[420px] flex-col overflow-hidden roomy:h-auto roomy:min-h-0">
        <SectionTitle
          icon={Users}
          title="Duty roster"
          hint={`${roster.filter((person) => person.online).length} online`}
        />
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
          {roster.length === 0 ? (
            <li className="py-6 text-center text-[10.5px] text-[var(--text-faint)]">Nobody is on shift.</li>
          ) : null}
          {roster.map((person) => {
            const isMe = person.name === medic.name;
            return (
              <li
                key={person.badge || person.name}
                className={cx(
                  "mt-raise flex items-center gap-2.5 rounded-lg px-2.5 py-2",
                  isMe && "border-[var(--line-hot)]",
                  !person.online && "opacity-55",
                )}
              >
                <div className="relative shrink-0">
                  <Avatar name={person.name} size={32} color={isMe ? "var(--crit)" : "var(--pink)"} ring={isMe} />
                  <span
                    className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#120a13]"
                    style={{ background: person.online ? "var(--ok)" : "var(--text-faint)" }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold text-[var(--text)]">{person.name}</p>
                  <p className="mt-num truncate text-[9px] text-[var(--text-faint)]">
                    {person.rank} · {person.unit}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(person.certs || []).map((cert) => (
                      <span
                        key={cert}
                        className="rounded px-1 py-[1px] text-[8px] font-bold uppercase tracking-[0.1em] text-[var(--text-faint)]"
                        style={{ border: "1px solid var(--line)" }}
                      >
                        {cert}
                      </span>
                    ))}
                  </div>
                </div>
                {isMe ? <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[var(--crit)]" /> : null}
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
