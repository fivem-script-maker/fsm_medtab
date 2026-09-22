import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Minus, Package, Plus, Search, TriangleAlert, Weight } from "lucide-react";
import { asset, cx } from "../../lib/ui.js";
import { useMedtab } from "../../state/store.jsx";
import { Btn, Chip, Empty, Field, Meter, Panel, SectionTitle } from "../ui/Kit.jsx";

/* `stock` is what the station locker holds, `carried` is what this medic has on
   them, and `takeLimit` is how many of an item they may carry at once — all
   three are the server's numbers, none of them are worked out here. */
function stockTone(item) {
  if (item.stock === 0) return "var(--crit)";
  if (item.stock <= Math.max(1, Math.round(item.max * 0.3))) return "var(--warn)";
  return "var(--ok)";
}

export default function SuppliesPage() {
  const { medic, returnSupply, supplies, takeSupply } = useMedtab();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  const filtered = supplies.filter((item) => {
    if (!query.trim()) return true;
    return `${item.label} ${item.category} ${item.use}`.toLowerCase().includes(query.trim().toLowerCase());
  });

  const selected = supplies.find((item) => item.id === selectedId) || filtered[0] || null;
  const carriedKg = supplies.reduce((sum, item) => sum + (item.carried || 0) * item.weightKg, 0);
  const carriedCount = supplies.reduce((sum, item) => sum + (item.carried || 0), 0);
  const lowStock = supplies.filter((item) => item.stock <= Math.max(1, Math.round(item.max * 0.3)));
  const atStation = medic.atStation !== false;
  const canDraw = selected && atStation && selected.stock > 0 && (selected.carried || 0) < (selected.takeLimit || 1);
  const canReturn = selected && atStation && (selected.carried || 0) > 0;

  return (
    <div className="grid h-full grid-cols-1 gap-3 overflow-y-auto p-3 sm:p-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      {/* ── Grid ────────────────────────────────────────────────────────── */}
      <Panel className="flex h-[460px] flex-col overflow-hidden roomy:h-auto roomy:min-h-0">
        <SectionTitle
          icon={Package}
          title="Station supply"
          hint={medic.atStationLabel || medic.station || `${filtered.length}/${supplies.length}`}
          right={
            <div className="flex items-center gap-1.5">
              {!atStation ? (
                <Chip color="var(--warn)" icon={TriangleAlert}>
                  Away from locker
                </Chip>
              ) : null}
              {lowStock.length > 0 ? (
                <Chip color="var(--warn)" icon={TriangleAlert}>
                  {lowStock.length} low
                </Chip>
              ) : null}
            </div>
          }
        />

        <div className="shrink-0 px-3 pb-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-faint)]" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search supplies…"
              aria-label="Search supplies"
              className="mt-field h-8 w-full rounded-lg pl-8 pr-2.5 text-[11px]"
            />
          </div>
          <div className="mt-inset mt-2.5 flex items-center gap-2.5 rounded-lg px-2.5 py-1.5">
            <Weight className="h-3.5 w-3.5 shrink-0 text-[var(--pink)]" />
            <span className="min-w-0 flex-1 truncate text-[9px] uppercase tracking-[0.14em] text-[var(--text-faint)]">
              In your kit
            </span>
            <span className="mt-num shrink-0 text-[10px] text-[var(--text-dim)]">
              {carriedCount} items · {carriedKg.toFixed(1)} kg
            </span>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2.5 overflow-y-auto px-3 pb-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {filtered.length === 0 ? (
            <div className="col-span-full">
              <Empty icon={Search} title="Nothing found" hint="No supply matches that search." />
            </div>
          ) : null}

          {filtered.map((item) => {
            const tone = stockTone(item);
            const active = selected && item.id === selected.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                aria-pressed={active}
                className={cx(
                  "mt-raise group relative flex flex-col overflow-hidden rounded-xl p-2.5 text-left transition-all duration-200",
                  active ? "border-[var(--line-hot)]" : "hover:border-[var(--line-hot)]",
                )}
                style={active ? { boxShadow: "0 0 28px -14px var(--crit)" } : undefined}
              >
                <span
                  className="pointer-events-none absolute -right-6 -top-8 h-20 w-20 rounded-full opacity-25 blur-2xl transition-opacity group-hover:opacity-40"
                  style={{ background: tone }}
                />
                {(item.carried || 0) > 0 ? (
                  <span
                    className="mt-num absolute right-2 top-2 rounded px-1 py-0.5 text-[8.5px] font-bold text-[var(--pink)]"
                    style={{ border: "1px solid var(--pink)", background: "rgba(255,116,168,.12)" }}
                  >
                    {item.carried} carried
                  </span>
                ) : item.stock === 0 ? (
                  <span className="absolute right-2 top-2 rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-[var(--crit)]" style={{ border: "1px solid var(--crit)" }}>
                    Empty
                  </span>
                ) : null}

                <div className="mt-inset relative mb-2 grid aspect-square w-full place-items-center overflow-hidden rounded-lg p-2">
                  <img
                    src={asset(`img/items/${item.id}.png`)}
                    alt={item.label}
                    loading="lazy"
                    className={cx(
                      "max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105",
                      item.stock === 0 && "opacity-35 grayscale",
                    )}
                  />
                </div>

                <p className="truncate text-[11px] font-semibold leading-tight text-[var(--text)]">{item.label}</p>
                <p className="mt-num mt-0.5 flex items-center gap-1 text-[9px] text-[var(--text-faint)]">
                  <span style={{ color: tone }}>{item.stock}</span>/{item.max}
                  <span className="ml-auto">{item.category}</span>
                </p>
                <Meter value={item.stock} max={item.max} color={tone} height={4} ticks={false} className="mt-1.5" />
              </button>
            );
          })}
        </div>
      </Panel>

      {/* ── Detail ──────────────────────────────────────────────────────── */}
      <Panel className="flex h-[420px] flex-col overflow-hidden roomy:h-auto roomy:min-h-0">
        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="flex min-h-0 flex-1 flex-col"
            >
              <SectionTitle icon={Package} title={selected.label} />

              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-3">
                <div
                  className="mt-inset relative grid min-h-[150px] flex-1 place-items-center overflow-hidden rounded-xl p-4"
                  style={{
                    backgroundImage:
                      "radial-gradient(70% 70% at 50% 40%, rgba(255,45,85,.16), rgba(0,0,0,0) 70%), linear-gradient(180deg, rgba(0,0,0,.4), rgba(255,116,168,.04))",
                  }}
                >
                  <img
                    src={asset(`img/items/${selected.id}.png`)}
                    alt={selected.label}
                    className="max-h-full max-w-full object-contain drop-shadow-[0_10px_24px_rgba(0,0,0,.6)]"
                  />
                </div>

                <p className="mt-3 shrink-0 text-[11px] leading-relaxed text-[var(--text-dim)]">{selected.use}</p>

                <div className="mt-hair my-3 shrink-0" />

                <Field label="In locker" value={`${selected.stock} of ${selected.max}`} mono color={stockTone(selected)} />
                <Field
                  label="On you"
                  value={`${selected.carried || 0} of ${selected.takeLimit || 1} allowed`}
                  mono
                  color={(selected.carried || 0) > 0 ? "var(--pink)" : undefined}
                />
                <Field label="Unit weight" value={`${selected.weightKg.toFixed(2)} kg`} mono />
                <Field label="Carried weight" value={`${((selected.carried || 0) * selected.weightKg).toFixed(2)} kg`} mono />
                <Field label="Category" value={selected.category} />

                <Meter value={selected.stock} max={selected.max} color={stockTone(selected)} className="mt-2.5" />
              </div>

              <div className="shrink-0 border-t border-[var(--line-2)] p-3">
                <div className="grid grid-cols-3 items-center gap-2">
                  <Btn
                    size="sm"
                    icon={Minus}
                    disabled={!canReturn}
                    onClick={() => returnSupply(selected.id, 1)}
                    aria-label={`Return one ${selected.label}`}
                  >
                    Return
                  </Btn>
                  <Btn
                    size="sm"
                    icon={Plus}
                    disabled={!canDraw}
                    onClick={() => takeSupply(selected.id, 1)}
                    aria-label={`Draw one ${selected.label}`}
                  >
                    Draw
                  </Btn>
                  <Btn
                    size="sm"
                    variant="primary"
                    disabled={!canDraw}
                    onClick={() =>
                      takeSupply(
                        selected.id,
                        Math.max(1, Math.min(selected.stock, (selected.takeLimit || 1) - (selected.carried || 0))),
                      )
                    }
                  >
                    Fill kit
                  </Btn>
                </div>
                <p className="mt-2 text-center text-[9px] leading-relaxed text-[var(--text-faint)]">
                  {!atStation
                    ? "Stand at a station supply point to draw or return stock."
                    : `Carry limit ${selected.takeLimit || 1} — the server enforces it.`}
                </p>
              </div>
            </motion.div>
          ) : (
            <Empty key="none" icon={Package} title="Locker is empty" />
          )}
        </AnimatePresence>
      </Panel>
    </div>
  );
}
