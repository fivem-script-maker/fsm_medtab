import { useEffect, useState } from "react";
import { FileText, ListChecks, PenLine, Search, Send } from "lucide-react";
import { cx } from "../../lib/ui.js";
import { useMedtab } from "../../state/store.jsx";
import { Btn, Chip, Empty, Field, Panel, SectionTitle } from "../ui/Kit.jsx";

const STATUS = {
  filed: { color: "var(--ok)", label: "Filed" },
  review: { color: "var(--warn)", label: "In review" },
  draft: { color: "var(--text-faint)", label: "Draft" },
};

/* These four strings are the only outcomes the server will accept; anything
   else is rewritten to "Treated on scene" before it is written down. */
const OUTCOMES = ["Transported", "Treated on scene", "Refused transport", "Deceased"];

/* The server refuses a narrative shorter than this. */
const MIN_NARRATIVE = 40;

export default function ReportsPage({ selectedPatientId, selectedCallId }) {
  const { calls, fileReport, medic, patients, protocols, pushToast, reports, rules } = useMedtab();
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({
    patientId: "",
    callId: "",
    outcome: OUTCOMES[0],
    narrative: "",
    procedures: [],
  });

  /* Pre-fill from whatever the medic was last looking at, and keep the two
     selects pointing at something that still exists. */
  useEffect(() => {
    setForm((current) => {
      const patient =
        patients.find((entry) => String(entry.serverId) === String(current.patientId)) ||
        patients.find((entry) => entry.id === selectedPatientId) ||
        patients[0] ||
        null;
      const call =
        calls.find((entry) => entry.id === current.callId) ||
        calls.find((entry) => entry.id === selectedCallId) ||
        calls[0] ||
        null;
      const patientId = patient ? String(patient.serverId) : "";
      const callId = call ? call.id : "";
      if (patientId === current.patientId && callId === current.callId) return current;
      return { ...current, patientId, callId };
    });
  }, [calls, patients, selectedCallId, selectedPatientId]);

  const filtered = reports.filter((report) =>
    `${report.id} ${report.patient} ${report.type} ${report.author}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const chosenPatient = patients.find((entry) => String(entry.serverId) === String(form.patientId)) || null;

  const toggleProcedure = (id) =>
    setForm((current) => ({
      ...current,
      procedures: current.procedures.includes(id)
        ? current.procedures.filter((entry) => entry !== id)
        : [...current.procedures, id],
    }));

  const submit = (event) => {
    event.preventDefault();
    if (form.narrative.trim().length < MIN_NARRATIVE) {
      pushToast({
        title: "Narrative too short",
        body: `At least ${MIN_NARRATIVE} characters — describe the presentation and the treatment given.`,
        tone: "warn",
      });
      return;
    }
    if (!form.patientId) {
      pushToast({ title: "No patient", body: "Pick the patient this report belongs to.", tone: "warn" });
      return;
    }
    /* Only ids and text go across. The fee is priced on the server from the
       procedures below — nothing here decides what anyone is charged. */
    fileReport({
      patientId: Number(form.patientId),
      callId: form.callId || null,
      outcome: form.outcome,
      narrative: form.narrative.trim(),
      procedures: form.procedures,
      type: chosenPatient ? chosenPatient.complaint : "Medical",
      complaint: chosenPatient ? chosenPatient.complaint : "",
    });
    setForm((current) => ({ ...current, narrative: "", procedures: [] }));
  };

  return (
    <div className="grid h-full grid-cols-1 gap-3 overflow-y-auto p-3 sm:p-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* ── Filed reports ───────────────────────────────────────────────── */}
      <Panel className="flex h-[420px] flex-col overflow-hidden roomy:h-auto roomy:min-h-0">
        <SectionTitle icon={FileText} title="Patient care reports" hint={`${filtered.length}`} />

        <div className="shrink-0 px-3 pb-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-faint)]" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search reports…"
              aria-label="Search reports"
              className="mt-field h-8 w-full rounded-lg pl-8 pr-2.5 text-[11px]"
            />
          </div>
        </div>

        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
          {filtered.length === 0 ? (
            <li>
              <Empty icon={Search} title="No reports" hint="Nothing matches that search." />
            </li>
          ) : null}
          {filtered.map((report) => {
            const status = STATUS[report.status] || STATUS.filed;
            return (
              <li key={report.id} className="mt-raise rounded-lg px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="mt-num text-[9px] text-[var(--text-faint)]">{report.id}</span>
                      <Chip color={status.color}>{status.label}</Chip>
                      <Chip color="var(--text-dim)">{report.type}</Chip>
                    </div>
                    <p className="mt-1 truncate text-[12px] font-semibold text-[var(--text)]">{report.patient}</p>
                    <p className="mt-num truncate text-[9.5px] text-[var(--text-faint)]">
                      {report.callId} · {report.date} {report.time} · {report.author}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="mt-num text-[11px]" style={{ color: report.billed > 0 ? "var(--ok)" : "var(--text-faint)" }}>
                      {report.billed > 0 ? `$${report.billed.toLocaleString()}` : "—"}
                    </p>
                    <p className="text-[8.5px] uppercase tracking-[0.12em] text-[var(--text-faint)]">{report.outcome}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      {/* ── Composer ────────────────────────────────────────────────────── */}
      <Panel className="flex h-[500px] flex-col overflow-hidden roomy:h-auto roomy:min-h-0">
        <SectionTitle icon={PenLine} title="New patient care report" right={<Chip color="var(--pink)">{medic.callsign}</Chip>} />

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="mt-rep-patient" className="text-[8.5px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">
                  Patient
                </label>
                <select
                  id="mt-rep-patient"
                  value={form.patientId}
                  onChange={(event) => setForm((current) => ({ ...current, patientId: event.target.value }))}
                  className="mt-field mt-1 h-8 w-full rounded-lg px-2 text-[11px]"
                >
                  {patients.length === 0 ? (
                    <option value="" style={{ background: "#120a13" }}>
                      No patient on the board
                    </option>
                  ) : null}
                  {patients.map((patient) => (
                    <option key={patient.id} value={String(patient.serverId)} style={{ background: "#120a13" }}>
                      {patient.name} — {patient.id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="mt-rep-call" className="text-[8.5px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">
                  Linked call
                </label>
                <select
                  id="mt-rep-call"
                  value={form.callId}
                  onChange={(event) => setForm((current) => ({ ...current, callId: event.target.value }))}
                  className="mt-field mt-1 h-8 w-full rounded-lg px-2 text-[11px]"
                >
                  <option value="" style={{ background: "#120a13" }}>
                    No linked call
                  </option>
                  {calls.map((call) => (
                    <option key={call.id} value={call.id} style={{ background: "#120a13" }}>
                      {call.id} — {call.type}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="mt-rep-outcome" className="text-[8.5px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">
                  Outcome
                </label>
                <select
                  id="mt-rep-outcome"
                  value={form.outcome}
                  onChange={(event) => setForm((current) => ({ ...current, outcome: event.target.value }))}
                  className="mt-field mt-1 h-8 w-full rounded-lg px-2 text-[11px]"
                >
                  {OUTCOMES.map((outcome) => (
                    <option key={outcome} value={outcome} style={{ background: "#120a13" }}>
                      {outcome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="text-[8.5px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">
                  Billing
                </span>
                <div className="mt-inset mt-1 flex h-8 items-center justify-between rounded-lg px-2.5">
                  <span className="truncate text-[10px] text-[var(--text-dim)]">
                    {rules.billingEnabled ? "Priced by the server" : "Billing disabled"}
                  </span>
                  <span className="mt-num shrink-0 text-[10px] text-[var(--text-faint)]">
                    max ${(rules.billingMaximum || 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex min-h-[132px] flex-1 flex-col">
              <label htmlFor="mt-rep-narrative" className="text-[8.5px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">
                Narrative
              </label>
              <textarea
                id="mt-rep-narrative"
                value={form.narrative}
                onChange={(event) => setForm((current) => ({ ...current, narrative: event.target.value }))}
                placeholder="Presentation on arrival, findings, interventions, response to treatment, handover…"
                className="mt-field mt-1 min-h-0 w-full flex-1 resize-none rounded-lg px-2.5 py-2 text-[11px] leading-relaxed"
              />
              <p
                className="mt-num mt-1 text-right text-[9px]"
                style={{
                  color:
                    form.narrative.trim().length < MIN_NARRATIVE ? "var(--warn)" : "var(--text-faint)",
                }}
              >
                {form.narrative.trim().length}/{MIN_NARRATIVE} characters minimum
              </p>
            </div>

            <div>
              <span className="flex items-center gap-1.5 text-[8.5px] font-semibold uppercase tracking-[0.16em] text-[var(--text-faint)]">
                <ListChecks className="h-3 w-3" />
                Procedures performed
              </span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {protocols.map((protocol) => {
                  const on = form.procedures.includes(protocol.id);
                  return (
                    <button
                      key={protocol.id}
                      type="button"
                      onClick={() => toggleProcedure(protocol.id)}
                      aria-pressed={on}
                      className={cx(
                        "mt-btn h-6 rounded-md px-2 text-[9px] font-semibold uppercase tracking-[0.1em]",
                        on && "border-[var(--line-hot)] text-[var(--pink)]",
                      )}
                    >
                      {protocol.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-inset rounded-lg px-3 py-2.5">
              <Field label="Reporting medic" value={medic.name} />
              <Field label="Badge" value={medic.badge} mono />
              <Field label="Patient" value={chosenPatient ? chosenPatient.name : "—"} />
              <Field label="Procedures logged" value={form.procedures.length} mono />
              <div className="mt-hair my-2" />
              <p className="text-[9px] leading-relaxed text-[var(--text-faint)]">
                Only the ids and the narrative are sent. The server prices the care from the procedures ticked above,
                charges the patient's bank account, and writes the report to the database.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 border-t border-[var(--line-2)] p-3">
            <Btn
              size="sm"
              onClick={() => {
                setForm((current) => ({ ...current, narrative: "", procedures: [] }));
                pushToast({ title: "Draft cleared", tone: "info" });
              }}
            >
              Clear
            </Btn>
            <Btn type="submit" size="sm" variant="primary" icon={Send} className={cx("ml-auto")}>
              File report
            </Btn>
          </div>
        </form>
      </Panel>
    </div>
  );
}
