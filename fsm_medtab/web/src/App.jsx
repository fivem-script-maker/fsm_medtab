import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Ambulance,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Package,
  Siren,
  Stethoscope,
} from "lucide-react";
import { MedtabProvider, useMedtab } from "./state/store.jsx";
import BootScreen from "./components/BootScreen.jsx";
import StatusBar from "./components/StatusBar.jsx";
import NavRail from "./components/NavRail.jsx";
import Toasts from "./components/Toasts.jsx";
import OverviewPage from "./components/pages/OverviewPage.jsx";
import DispatchPage from "./components/pages/DispatchPage.jsx";
import PatientsPage from "./components/pages/PatientsPage.jsx";
import TreatmentPage from "./components/pages/TreatmentPage.jsx";
import SuppliesPage from "./components/pages/SuppliesPage.jsx";
import UnitsPage from "./components/pages/UnitsPage.jsx";
import ReportsPage from "./components/pages/ReportsPage.jsx";

/**
 * MEDTAB — EMS medical tablet.
 *
 * The shell owns nothing but navigation and the current selection. Every value
 * on screen comes from the store, which in game is filled by the server and in
 * a plain browser falls back to sample data. Two panels can therefore never
 * show different answers for the same thing.
 */

const PAGES = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "dispatch", label: "Dispatch", icon: Siren },
  { id: "patients", label: "Patients", icon: ClipboardList },
  { id: "treatment", label: "Treatment", icon: Stethoscope },
  { id: "supplies", label: "Supplies", icon: Package },
  { id: "units", label: "Units", icon: Ambulance },
  { id: "reports", label: "Reports", icon: FileText },
];

function Tablet() {
  const {
    calls,
    patients,
    supplies,
    medic,
    toasts,
    dismissToast,
    closeTablet,
    tick,
  } = useMedtab();

  const [booted, setBooted] = useState(false);
  const [page, setPage] = useState("overview");
  const [selectedCallId, setSelectedCallId] = useState(null);
  const [selectedPatientId, setSelectedPatientId] = useState(null);

  /* The selection follows the live board: a call that closes or a patient who
     disconnects would otherwise leave the detail panel pointing at nothing. */
  useEffect(() => {
    if (calls.length === 0) {
      if (selectedCallId !== null) setSelectedCallId(null);
      return;
    }
    if (!calls.some((call) => call.id === selectedCallId)) setSelectedCallId(calls[0].id);
  }, [calls, selectedCallId]);

  useEffect(() => {
    if (patients.length === 0) {
      if (selectedPatientId !== null) setSelectedPatientId(null);
      return;
    }
    if (!patients.some((patient) => patient.id === selectedPatientId)) {
      setSelectedPatientId(patients[0].id);
    }
  }, [patients, selectedPatientId]);

  /* Close hands focus back to the game. In a plain browser there is no game to
     hand it to, so the tablet returns to the lock screen instead — the control
     still visibly does something while the UI is being reviewed. */
  const close = useCallback(() => {
    closeTablet();
    if (!(window.fsmNui && window.fsmNui.isGame)) setBooted(false);
  }, [closeTablet]);

  useEffect(() => {
    if (!booted) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [booted, close]);

  const openCall = useCallback((callId) => {
    setSelectedCallId(callId);
    setPage("dispatch");
  }, []);

  const openPatient = useCallback((patientId) => {
    setSelectedPatientId(patientId);
    setPage("patients");
  }, []);

  const criticalCount = patients.filter((patient) => patient.triage === "red").length;
  const priorityOneCount = calls.filter((call) => call.priority === 1).length;
  const lowStockCount = supplies.filter(
    (item) => item.stock <= Math.max(1, Math.round(item.max * 0.3)),
  ).length;

  const navPages = PAGES.map((entry) => ({
    ...entry,
    badge:
      entry.id === "dispatch"
        ? priorityOneCount
        : entry.id === "patients"
          ? criticalCount
          : entry.id === "supplies"
            ? lowStockCount || null
            : null,
  }));

  const activeCall = calls.find((call) => (call.assigned || []).includes(medic.callsign));

  const renderPage = () => {
    switch (page) {
      case "dispatch":
        return (
          <DispatchPage
            selectedCallId={selectedCallId}
            onSelectCall={setSelectedCallId}
          />
        );
      case "patients":
        return (
          <PatientsPage selectedPatientId={selectedPatientId} onSelectPatient={setSelectedPatientId} />
        );
      case "treatment":
        return (
          <TreatmentPage
            selectedPatientId={selectedPatientId}
            onSelectPatient={setSelectedPatientId}
          />
        );
      case "supplies":
        return <SuppliesPage />;
      case "units":
        return <UnitsPage />;
      case "reports":
        return <ReportsPage selectedPatientId={selectedPatientId} selectedCallId={selectedCallId} />;
      default:
        return <OverviewPage onOpenCall={openCall} onOpenPatient={openPatient} />;
    }
  };

  return (
    <div className="relative flex h-full w-full items-center justify-center p-[1.5vmin] sm:p-[2.5vmin]">
      <div className="mt-bezel relative flex h-full w-full max-w-[1680px] flex-col rounded-[16px] p-[5px] sm:rounded-[24px] sm:p-[9px]">
        {/* front-facing camera dot, purely chassis detail */}
        <span className="pointer-events-none absolute left-1/2 top-[3px] hidden h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-[#2a1520] shadow-[inset_0_0_2px_#000] sm:block" />

        <div className="mt-screen relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[11px] sm:rounded-[16px]">
          {/* glass sheen — decoration only, never intercepts a click */}
          <span
            className="pointer-events-none absolute inset-0 z-40 rounded-[11px] sm:rounded-[16px]"
            style={{
              background:
                "linear-gradient(118deg, rgba(255,255,255,.055) 0%, rgba(255,255,255,0) 26%, rgba(255,255,255,0) 72%, rgba(255,116,168,.035) 100%)",
            }}
          />

          <AnimatePresence mode="wait">
            {!booted ? (
              <motion.div
                key="boot"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, scale: 1.015 }}
                transition={{ duration: 0.3 }}
                className="min-h-0 flex-1"
              >
                <BootScreen onEnter={() => setBooted(true)} />
              </motion.div>
            ) : (
              <motion.div
                key="tablet"
                initial={{ opacity: 0, scale: 0.985 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <StatusBar
                  activeCall={activeCall ? activeCall.id : null}
                  onClose={close}
                  shiftSeconds={(medic.shiftStartedSecondsAgo || 0) + tick}
                />

                <div className="flex min-h-0 flex-1">
                  <NavRail pages={navPages} active={page} onSelect={setPage} onClose={close} />

                  <main className="relative min-w-0 flex-1 overflow-hidden">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={page}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                        className="h-full"
                      >
                        {renderPage()}
                      </motion.div>
                    </AnimatePresence>
                  </main>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <Toasts items={toasts} onDismiss={dismissToast} />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <MedtabProvider>
      <Tablet />
    </MedtabProvider>
  );
}
