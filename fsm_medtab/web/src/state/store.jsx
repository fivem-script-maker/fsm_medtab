import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ACTIVITY,
  CALLS,
  MEDIC,
  PATIENTS,
  PROTOCOLS,
  REPORTS,
  ROSTER,
  SHIFT_STATS,
  SUPPLIES,
  UNITS,
  UNIT_STATUS,
} from "../data/medtab.js";
import { clamp } from "../lib/ui.js";

/**
 * MEDTAB — the single source of truth for the interface.
 *
 * In game every value here arrives from the server inside one `state` message
 * and is redrawn roughly twice a second. The tablet keeps no copy of any rule
 * the server enforces: stock levels, certifications, prices and cooldowns are
 * read from the payload, never recomputed here, so the panel can never promise
 * something the server will refuse.
 *
 * In a plain browser — the studio preview — no message ever arrives, so the
 * sample data in data/medtab.js is used instead and actions mutate it locally.
 * That path is clearly marked: `live` is false and every page can say so.
 *
 * Nothing in this module reads a FiveM global at module scope. The same bundle
 * runs in both places, and a missing global at import time would take the whole
 * app down before it rendered.
 */

const PREVIEW = {
  medic: MEDIC,
  unitStatus: "10-23",
  unitStatuses: UNIT_STATUS,
  calls: CALLS,
  patients: PATIENTS,
  units: UNITS,
  roster: ROSTER,
  supplies: SUPPLIES,
  protocols: PROTOCOLS,
  reports: REPORTS,
  stats: SHIFT_STATS,
  activity: ACTIVITY,
  map: { tileUrl: null },
  rules: {
    treatDistance: 4.0,
    stationRadius: 6.0,
    billingEnabled: true,
    billingMaximum: 10000,
    callExpiryMinutes: 30,
  },
  server: { persistence: false },
};

const MedtabContext = createContext(null);

export function useMedtab() {
  const value = useContext(MedtabContext);
  if (!value) throw new Error("useMedtab must be used inside <MedtabProvider>");
  return value;
}

/* The NUI bridge is read at runtime, never at module scope. */
function post(name, data) {
  if (typeof window !== "undefined" && window.fsmNui) return window.fsmNui.post(name, data);
  return Promise.resolve();
}

export function MedtabProvider({ children }) {
  const [state, setState] = useState(PREVIEW);
  const [live, setLive] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [treatments, setTreatments] = useState([]);
  const [tick, setTick] = useState(0);
  const toastSeq = useRef(0);
  const liveRef = useRef(false);

  /* one shared second-tick drives every elapsed timer on every page */
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const pushToast = useCallback((toast) => {
    toastSeq.current += 1;
    const id = toastSeq.current;
    setToasts((current) => [...current.slice(-3), { id, tone: "info", ...toast }]);
    setTimeout(() => setToasts((current) => current.filter((entry) => entry.id !== id)), 4200);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((entry) => entry.id !== id));
  }, []);

  /* Everything the game sends arrives here. The server is the only writer of
     `state`; the reducer below simply replaces what it sent. */
  useEffect(() => {
    const onMessage = (event) => {
      const message = event && event.data;
      if (!message || typeof message !== "object") return;

      switch (message.action) {
        case "state": {
          if (!message.data) return;
          liveRef.current = true;
          setLive(true);
          setState((current) => ({ ...current, ...message.data }));
          return;
        }
        case "toast": {
          if (message.data) pushToast(message.data);
          return;
        }
        case "treatmentStarted": {
          const entry = message.data;
          if (!entry) return;
          setTreatments((current) => [
            ...current.filter((item) => item.token !== entry.token),
            { ...entry, startedAt: Date.now() },
          ]);
          return;
        }
        case "treatmentEnded": {
          const entry = message.data;
          if (!entry) return;
          setTreatments((current) => current.filter((item) => item.token !== entry.token));
          return;
        }
        case "open": {
          /* Settings the server owner controls travel with the open message. */
          if (message.map && typeof message.map.tileUrl === "string" && message.map.tileUrl) {
            setState((current) => ({ ...current, map: { ...current.map, tileUrl: message.map.tileUrl } }));
          }
          return;
        }
        default:
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [pushToast]);

  /* A preview-only local mutation. In game this never runs: the server owns
     the state and answers with a fresh payload instead. */
  const preview = useCallback((mutate, toast) => {
    if (liveRef.current) return false;
    setState((current) => mutate(current) || current);
    if (toast) pushToast(toast);
    return true;
  }, [pushToast]);

  // ── actions ─────────────────────────────────────────────────────────────
  // Each one posts to the client script, which forwards it to the server. The
  // UI never applies the outcome itself in game — it waits to be told.

  const setStatus = useCallback((code) => {
    post("setStatus", { code });
    preview((current) => ({ ...current, unitStatus: code }), null);
  }, [preview]);

  const callAction = useCallback((id, action) => {
    post("callAction", { id, action });
    preview((current) => {
      if (action === "clear") {
        return { ...current, calls: current.calls.filter((call) => call.id !== id) };
      }
      return current;
    }, {
      enroute: { title: "Route set — en route", body: id, tone: "ok" },
      onscene: { title: "Marked on scene", body: id, tone: "ok" },
      contact: { title: "Calling reporting party", body: id, tone: "info" },
      clear: { title: "Call cleared", body: id, tone: "ok" },
    }[action]);
  }, [preview]);

  /* Drawing moves stock from the station shelf into the medic's own kit; the
     preview mirrors both sides so the numbers behave the way the server's do. */
  const takeSupply = useCallback((item, amount = 1) => {
    post("takeSupply", { item, amount });
    preview((current) => ({
      ...current,
      supplies: current.supplies.map((entry) => {
        if (entry.id !== item) return entry;
        const moved = Math.min(amount, entry.stock, (entry.takeLimit || amount) - (entry.carried || 0));
        if (moved <= 0) return entry;
        return { ...entry, stock: clamp(entry.stock - moved, 0, entry.max), carried: (entry.carried || 0) + moved };
      }),
    }), null);
  }, [preview]);

  const returnSupply = useCallback((item, amount = 1) => {
    post("returnSupply", { item, amount });
    preview((current) => ({
      ...current,
      supplies: current.supplies.map((entry) => {
        if (entry.id !== item) return entry;
        const moved = Math.min(amount, entry.carried || 0);
        if (moved <= 0) return entry;
        return { ...entry, stock: clamp(entry.stock + moved, 0, entry.max), carried: (entry.carried || 0) - moved };
      }),
    }), null);
  }, [preview]);

  const beginTreatment = useCallback((protocolId, patientServerId, patientLabel) => {
    post("beginTreatment", { protocol: protocolId, patient: patientServerId });

    /* Preview only: the server would normally issue the token and time it. */
    if (!liveRef.current) {
      const protocol = PREVIEW.protocols.find((entry) => entry.id === protocolId);
      if (!protocol) return;
      const token = `preview-${protocolId}-${Date.now()}`;
      setTreatments((current) => [
        ...current,
        {
          token,
          protocol: protocol.id,
          name: protocol.name,
          seconds: protocol.seconds,
          startedAt: Date.now(),
          patientLabel,
        },
      ]);
      if (protocol.item) {
        setState((current) => ({
          ...current,
          supplies: current.supplies.map((entry) =>
            entry.id === protocol.item
              ? { ...entry, carried: Math.max(0, (entry.carried || 0) - 1) }
              : entry,
          ),
        }));
      }
      setTimeout(() => {
        setTreatments((current) => current.filter((entry) => entry.token !== token));
        pushToast({ title: "Treatment complete", body: `${protocol.name} — ${patientLabel || "patient"}`, tone: "ok" });
      }, protocol.seconds * 1000);
    }
  }, [pushToast]);

  const cancelTreatment = useCallback((token) => {
    post("cancelTreatment", { token });
    if (!liveRef.current) {
      setTreatments((current) => current.filter((entry) => entry.token !== token));
      pushToast({ title: "Treatment cancelled", tone: "warn" });
    }
  }, [pushToast]);

  const fileReport = useCallback((payload) => {
    post("fileReport", payload);
    if (!liveRef.current) {
      pushToast({
        title: "Report filed",
        body: "Preview only — nothing was sent to a server.",
        tone: "ok",
      });
    }
  }, [pushToast]);

  const pageUnit = useCallback((callsign) => {
    post("pageUnit", { callsign });
    if (!liveRef.current) pushToast({ title: "Paged", body: `${callsign} has been notified.`, tone: "ok" });
  }, [pushToast]);

  const setWaypoint = useCallback((x, y) => {
    post("setWaypoint", { x, y });
  }, []);

  const closeTablet = useCallback(() => {
    if (typeof window !== "undefined" && window.fsmNui) window.fsmNui.close();
  }, []);

  const value = useMemo(() => ({
    ...state,
    live,
    tick,
    toasts,
    treatments,
    pushToast,
    dismissToast,
    setStatus,
    callAction,
    takeSupply,
    returnSupply,
    beginTreatment,
    cancelTreatment,
    fileReport,
    pageUnit,
    setWaypoint,
    closeTablet,
  }), [
    state, live, tick, toasts, treatments, pushToast, dismissToast, setStatus, callAction,
    takeSupply, returnSupply, beginTreatment, cancelTreatment, fileReport, pageUnit,
    setWaypoint, closeTablet,
  ]);

  return <MedtabContext.Provider value={value}>{children}</MedtabContext.Provider>;
}
