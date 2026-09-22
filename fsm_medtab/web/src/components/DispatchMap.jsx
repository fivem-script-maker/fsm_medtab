import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Ambulance, Crosshair, Maximize2, Minimize2, Minus, Plus } from "lucide-react";
import { asset, cx } from "../lib/ui.js";
import { MAP_CALIBRATION } from "../data/medtab.js";

/**
 * Dispatch map, drawn by Leaflet over a real Los Santos plate.
 *
 * Leaflet runs in `CRS.Simple`, so the coordinate space is the plate's own
 * pixels rather than latitude/longitude — the world is flat and finite, which
 * is exactly what a game map is. Everything on it is keyed to GTA V world
 * coordinates and converted once, in `toLatLng`, so a pin, a unit and the
 * recentre button all agree about where a place is.
 *
 * The plate is swappable: point `tileUrl` at a Los Santos tile set (the usual
 * `{z}/{x}/{y}.png` pyramid a server already hosts) and Leaflet uses that
 * instead of the bundled image, with no other change.
 */

const PRIORITY_COLOR = { 1: "#ff2d55", 2: "#ffc24b", 3: "#35e0a1" };

const STATUS_COLOR = {
  "10-8": "#35e0a1", // available
  "10-7": "#7a6a78", // out of service
  "10-17": "#ffc24b", // en route
  "10-23": "#ff2d55", // on scene
  "10-19": "#ffc24b", // returning
};

/**
 * Plate pixel size. Only the RATIO is used — it is what lets the plate be drawn
 * at its true shape instead of being squeezed into the world rectangle.
 */
const PLATE = { w: 2048, h: 2048 };

const WEST = MAP_CALIBRATION.west;
const EAST = MAP_CALIBRATION.east;
const SOUTH = MAP_CALIBRATION.south;
const NORTH = MAP_CALIBRATION.north;
const WORLD_W = EAST - WEST;
const WORLD_H = NORTH - SOUTH;
const CENTRE_X = (WEST + EAST) / 2;
const CENTRE_Y = (SOUTH + NORTH) / 2;

/**
 * The coordinate space IS the game world: in CRS.Simple a latlng is just an
 * (y, x) pair, so a world coordinate can be handed to Leaflet untouched. No
 * conversion means no scale factor to get wrong, and the map, the pins and the
 * calibration cannot drift apart.
 */
const toLatLng = (world) => (world ? L.latLng(world.y, world.x) : null);

const WORLD_BOUNDS = L.latLngBounds([SOUTH, WEST], [NORTH, EAST]);

/**
 * The plate COVERS the world rectangle rather than fitting inside it: scaled to
 * its own aspect until it overlaps on both axes, then centred, so the excess is
 * cropped and the artwork is never stretched (design law 2). This is also what
 * keeps the panel full — with a fit, a tall plate in a wide panel leaves empty
 * bars down both sides.
 */
const PLATE_SCALE = Math.max(WORLD_W / PLATE.w, WORLD_H / PLATE.h);
const PLATE_W = PLATE.w * PLATE_SCALE;
const PLATE_H = PLATE.h * PLATE_SCALE;
const PLATE_BOUNDS = L.latLngBounds(
  [CENTRE_Y - PLATE_H / 2, CENTRE_X - PLATE_W / 2],
  [CENTRE_Y + PLATE_H / 2, CENTRE_X + PLATE_W / 2],
);

/**
 * Zoom at which the plate exactly covers the container. In CRS.Simple one world
 * unit is 2^zoom pixels, so this is the smallest zoom with no empty space at
 * any edge — used as BOTH the opening view and the zoom floor, which is what
 * makes it impossible to zoom out into the void.
 */
function coverZoom(map) {
  const size = map.getSize();
  if (!size.x || !size.y) return -3;
  return Math.log2(Math.max(size.x / PLATE_W, size.y / PLATE_H));
}

/** Call pin. Built as markup so it inherits the panel's own palette. */
function callIcon(call, active) {
  const color = PRIORITY_COLOR[call.priority] || "#ff74a8";
  const ring = call.priority === 1 ? `<span class="mt-map-ping" style="border-color:${color}"></span>` : "";
  return L.divIcon({
    className: "mt-map-icon",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `
      <span class="mt-map-pin${active ? " is-active" : ""}" style="--pin:${color}">
        ${ring}
        <span class="mt-map-pin-halo"></span>
        <span class="mt-map-pin-core"></span>
      </span>`,
  });
}

/** Unit chip — a unit is a vehicle, so it reads as a plate, not a dot. */
function unitIcon(unit, extra = 0) {
  const color = STATUS_COLOR[unit.status] || "#ff74a8";
  const more = extra > 0 ? `<span class="mt-map-unit-more">+${extra}</span>` : "";
  return L.divIcon({
    className: "mt-map-icon",
    iconSize: [58, 20],
    // Sits to the RIGHT of its point, not on it. A unit on scene shares the
    // call's coordinates, and a centred chip buried the call pin under the
    // callsign — the one marker a dispatcher most needs to see. The offset
    // goes sideways because the covered view is tight vertically and has
    // room to spare horizontally; dropping it down pushed chips off the
    // bottom edge of the small panel.
    iconAnchor: [-16, 10],
    html: `
      <span class="mt-map-unit${unit.mine ? " is-mine" : ""}" style="--unit:${color}">
        <span class="mt-map-unit-dot"></span>
        <span class="mt-map-unit-label">${unit.callsign}</span>
        ${more}
      </span>`,
  });
}

export default function DispatchMap({
  calls = [],
  units = [],
  selectedId,
  onSelect,
  tileUrl = null,
  className,
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <MapSurface
        calls={calls}
        units={units}
        selectedId={selectedId}
        onSelect={onSelect}
        tileUrl={tileUrl}
        expanded={false}
        onToggle={() => setExpanded(true)}
        className={className}
      />

      {expanded
        ? createPortal(
            <div
              className="fixed inset-0 z-[3000] flex items-center justify-center p-[2vmin] sm:p-[4vmin]"
              role="dialog"
              aria-modal="true"
              aria-label="Dispatch map, full screen"
            >
              {/* Scrim only — the world behind an open panel is dimmed, never
                  replaced, so the resource can't black out the game. */}
              <button
                type="button"
                aria-label="Close full screen map"
                onClick={() => setExpanded(false)}
                className="absolute inset-0 bg-[rgba(4,2,8,.42)] backdrop-blur-[2px]"
              />
              <div className="mt-panel relative flex h-full w-full max-w-[1680px] flex-col overflow-hidden rounded-2xl">
                <MapSurface
                  calls={calls}
                  units={units}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  tileUrl={tileUrl}
                  expanded
                  onToggle={() => setExpanded(false)}
                  className="min-h-0 flex-1"
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function MapSurface({ calls, units, selectedId, onSelect, tileUrl, expanded, onToggle, className }) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef({ calls: null, units: null });
  const [ready, setReady] = useState(false);

  // Handlers change every render; the Leaflet layers are rebuilt from an effect
  // that must NOT re-run for that. Keep them in a ref the layer code reads.
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const entriesRef = useRef({ calls, units });
  entriesRef.current = { calls, units };

  // ── map lifecycle ───────────────────────────────────────────────────────
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const map = L.map(host, {
      crs: L.CRS.Simple,
      minZoom: -8, // replaced by the real cover floor as soon as we can measure
      maxZoom: 3,
      zoomSnap: 0,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 140,
      zoomControl: false,
      attributionControl: false,
      maxBounds: PLATE_BOUNDS,
      maxBoundsViscosity: 1,
      // A small panel is for glancing at; the big one is for working in.
      dragging: true,
      scrollWheelZoom: expanded,
      doubleClickZoom: false,
      keyboard: expanded,
    });

    if (tileUrl) {
      L.tileLayer(tileUrl, { noWrap: true, bounds: PLATE_BOUNDS, minZoom: -8, maxZoom: 3 }).addTo(map);
    } else {
      L.imageOverlay(asset("img/map/los-santos.jpg"), PLATE_BOUNDS, { alt: "Los Santos" }).addTo(map);
    }

    // Open covered rather than fitted: a fit would letterbox the plate inside a
    // panel of a different shape, which is exactly the empty-bars look.
    const focusCentre = () => {
      const { calls: c, units: u } = entriesRef.current;
      const points = [...c, ...u].map((entry) => toLatLng(entry.world)).filter(Boolean);
      return points.length ? L.latLngBounds(points).getCenter() : WORLD_BOUNDS.getCenter();
    };

    const applyCoverFloor = (recentre) => {
      const floor = coverZoom(map);
      map.setMinZoom(floor);
      if (recentre || map.getZoom() < floor) {
        // Centre on the traffic, not on the middle of the world. A short, wide
        // panel can only show a slice of a square plate, and the slice worth
        // showing is the one with the calls and units in it.
        map.setView(focusCentre(), floor, { animate: false });
      }
    };
    applyCoverFloor(true);

    layersRef.current.calls = L.layerGroup().addTo(map);
    layersRef.current.units = L.layerGroup().addTo(map);
    mapRef.current = map;
    setReady(true);

    // Leaflet sizes itself once and then trusts that measurement, so a panel
    // that grows later leaves the map rendering into the old box — grey bands
    // down the side. Re-measure whenever the host actually changes size.
    const observer = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
      applyCoverFloor(false);
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // `expanded` only picks the interaction profile at construction time, and
    // the two surfaces are separate instances, so this is a one-shot setup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileUrl]);

  // ── call pins ───────────────────────────────────────────────────────────
  useEffect(() => {
    const group = layersRef.current.calls;
    if (!ready || !group) return;
    group.clearLayers();
    for (const call of calls) {
      const at = toLatLng(call.world);
      if (!at) continue;
      const marker = L.marker(at, {
        icon: callIcon(call, call.id === selectedId),
        keyboard: false,
        title: `${call.id} · P${call.priority} · ${call.type}`,
        alt: `Call ${call.id}, priority ${call.priority}, ${call.type}`,
        zIndexOffset: call.id === selectedId ? 1000 : call.priority === 1 ? 500 : 0,
      });
      marker.on("click", (event) => {
        // Otherwise the click also reaches the plate and toggles full screen.
        L.DomEvent.stopPropagation(event);
        if (selectRef.current) selectRef.current(call.id);
      });
      marker.bindTooltip(
        `<b>${call.type}</b><br>${call.street}<br><span class="mt-map-tip-dim">${call.id} · P${call.priority}</span>`,
        { direction: "top", offset: [0, -12], className: "mt-map-tip" },
      );
      marker.addTo(group);
    }
  }, [calls, selectedId, ready]);

  // ── unit chips ──────────────────────────────────────────────────────────
  // Units bunch up: every crew at the same scene shares one set of
  // coordinates, so at a low zoom their chips land on top of each other and
  // neither callsign can be read. Group whatever overlaps ON SCREEN into one
  // chip with a count, and let zooming in break the group apart by itself.
  useEffect(() => {
    const map = mapRef.current;
    const group = layersRef.current.units;
    if (!ready || !map || !group) return undefined;

    const draw = () => {
      group.clearLayers();

      // A chip sits 16px right of its point and runs ~46px wide, so two points
      // closer than this overlap; anything further apart is readable as-is.
      const groups = [];
      for (const unit of units) {
        const at = toLatLng(unit.world);
        if (!at) continue;
        const pt = map.latLngToContainerPoint(at);
        const near = groups.find((g) => Math.abs(g.pt.x - pt.x) < 62 && Math.abs(g.pt.y - pt.y) < 18);
        if (near) near.members.push(unit);
        else groups.push({ pt, members: [unit] });
      }

      for (const { members } of groups) {
        // The player's own unit always leads the chip it is part of.
        const lead = members.find((u) => u.mine) || members[0];
        const at = toLatLng(lead.world);
        const extra = members.length - 1;
        const marker = L.marker(at, {
          icon: unitIcon(lead, extra),
          keyboard: false,
          title: members.map((u) => `${u.callsign} · ${u.status}`).join(" / "),
          alt: extra
            ? `${members.length} units: ${members.map((u) => u.callsign).join(", ")}`
            : `Unit ${lead.callsign}, status ${lead.status}`,
          zIndexOffset: members.some((u) => u.mine) ? 800 : 200,
        });
        marker.bindTooltip(
          members
            .map(
              (u) =>
                `<b>${u.callsign}</b><br>${u.location}<br><span class="mt-map-tip-dim">${u.status} · ${u.vehicleLabel}</span>`,
            )
            .join('<span class="mt-map-tip-rule"></span>'),
          { direction: "top", offset: [0, -10], className: "mt-map-tip" },
        );
        marker.on("click", (event) => L.DomEvent.stopPropagation(event));
        marker.addTo(group);
      }
    };

    draw();
    // Panning cannot change which chips overlap — only a change of scale can.
    map.on("zoomend", draw);
    map.on("resize", draw);
    return () => {
      map.off("zoomend", draw);
      map.off("resize", draw);
    };
  }, [units, ready]);

  // ── keep the selected call in view ──────────────────────────────────────
  // Only for a real change of selection. Running this on mount threw the
  // opening view onto whichever call happens to be first in the list, which
  // is what pinned the map to the bottom edge of the plate and pushed the
  // northern units off screen.
  const pannedForRef = useRef(selectedId);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !selectedId) return;
    if (pannedForRef.current === selectedId) return;
    pannedForRef.current = selectedId;
    const call = calls.find((c) => c.id === selectedId);
    const at = toLatLng(call && call.world);
    // panInside nudges only when the pin is genuinely outside the padded view,
    // so picking a call that is already on screen leaves the overview alone.
    if (at) map.panInside(at, { padding: [48, 48], animate: true, duration: 0.45 });
  }, [selectedId, calls, ready]);

  // ── escape closes the full screen map ───────────────────────────────────
  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      // Swallow it, or the shell's own Escape handler closes the whole tablet.
      event.stopPropagation();
      event.preventDefault();
      onToggle();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [expanded, onToggle]);

  // Click the plate to open full screen. Registered on the map itself so it
  // costs no overlay — an overlay would swallow drag and zoom. Leaflet already
  // suppresses `click` at the end of a drag, and the markers stop propagation,
  // so this only fires on a genuine click of open map.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || expanded) return undefined;
    const open = () => onToggle();
    map.on("click", open);
    return () => map.off("click", open);
  }, [ready, expanded, onToggle]);

  const zoomBy = useCallback((delta) => {
    const map = mapRef.current;
    if (map) map.setZoom(map.getZoom() + delta);
  }, []);

  const fitAll = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const points = [...calls, ...units].map((entry) => toLatLng(entry.world)).filter(Boolean);
    // Leaflet clamps a fit to minZoom, and minZoom is the cover floor, so this
    // frames everything it can without ever opening a gap at an edge.
    if (points.length === 0) map.setView(WORLD_BOUNDS.getCenter(), coverZoom(map), { animate: true });
    else map.fitBounds(L.latLngBounds(points).pad(0.18), { animate: true, maxZoom: 0 });
  }, [calls, units]);

  const counts = useMemo(
    () => ({
      calls: calls.filter((c) => c.world).length,
      units: units.filter((u) => u.world).length,
    }),
    [calls, units],
  );

  return (
    <div className={cx("mt-inset relative overflow-hidden rounded-lg", className)}>
      {/* The map host is absolutely positioned: an in-flow Leaflet container
          reports its own pixel size as an intrinsic minimum, which a flex or
          grid parent then refuses to shrink below. */}
      <div ref={hostRef} className={cx("mt-map absolute inset-0", !expanded && "mt-map-clickable")} />

      {/* overlay chrome */}
      <div className="pointer-events-none absolute inset-0 z-[600] flex flex-col justify-between p-2">
        <div className="flex items-start justify-between gap-2">
          <span className="mt-num flex items-center gap-2 rounded-md border border-[var(--line-2)] bg-[rgba(6,4,10,.74)] px-2 py-1 text-[8.5px] uppercase tracking-[0.16em] text-[var(--text-faint)] backdrop-blur-sm">
            <Crosshair className="h-3 w-3 text-[var(--pink)]" />
            Los Santos · {counts.calls} calls · {counts.units} units
          </span>

          <div className="pointer-events-auto flex items-center gap-1">
            <MapBtn onClick={() => zoomBy(0.5)} label="Zoom in" icon={Plus} />
            <MapBtn onClick={() => zoomBy(-0.5)} label="Zoom out" icon={Minus} />
            <MapBtn onClick={fitAll} label="Fit all units and calls" icon={Ambulance} />
            <MapBtn
              onClick={onToggle}
              label={expanded ? "Exit full screen" : "Full screen map"}
              icon={expanded ? Minimize2 : Maximize2}
              accent
            />
          </div>
        </div>

        <div className="flex items-end justify-between gap-2">
          <div className="flex items-center gap-2.5 rounded-md border border-[var(--line-2)] bg-[rgba(6,4,10,.74)] px-2 py-1 backdrop-blur-sm">
            {[1, 2, 3].map((p) => (
              <span key={p} className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: PRIORITY_COLOR[p] }} />
                <span className="mt-num text-[8px] text-[var(--text-faint)]">P{p}</span>
              </span>
            ))}
            <span className="h-2.5 w-px bg-[var(--line-2)]" />
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-2.5 rounded-[1px] bg-[var(--pink)]" />
              <span className="mt-num text-[8px] text-[var(--text-faint)]">Unit</span>
            </span>
          </div>

          {!expanded ? (
            <span className="mt-num rounded-md border border-[var(--line-2)] bg-[rgba(6,4,10,.74)] px-2 py-1 text-[8px] uppercase tracking-[0.14em] text-[var(--text-faint)] backdrop-blur-sm">
              Click to expand
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MapBtn({ onClick, label, icon: Icon, accent }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cx(
        "mt-btn grid h-6 w-6 place-items-center rounded-md backdrop-blur-sm transition-colors",
        accent && "border-[var(--line-hot)] text-[var(--pink)]",
      )}
    >
      <Icon className="h-3 w-3" />
    </button>
  );
}
