import { Power } from "lucide-react";
import { cx } from "../lib/ui.js";
import { useMedtab } from "../state/store.jsx";
import { Avatar } from "./ui/Kit.jsx";

/**
 * Left navigation. Labels appear from `xl` up; below that the rail collapses
 * to icons so the content area keeps its width on a small viewport.
 */
export default function NavRail({ pages, active, onSelect, onClose }) {
  const { medic } = useMedtab();

  return (
    <nav className="relative z-20 flex w-[58px] shrink-0 flex-col border-r border-[var(--line)] py-3 xl:w-[188px]">
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-px"
        style={{ background: "linear-gradient(180deg, transparent, var(--line-hot) 20%, var(--line-hot) 80%, transparent)" }}
      />

      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2">
        {pages.map((page) => {
          const Icon = page.icon;
          const isActive = page.id === active;
          return (
            <li key={page.id}>
              <button
                type="button"
                onClick={() => onSelect(page.id)}
                aria-current={isActive ? "page" : undefined}
                title={page.label}
                className={cx(
                  "group relative flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 transition-colors duration-200 xl:px-3",
                  isActive ? "text-[var(--text)]" : "text-[var(--text-faint)] hover:text-[var(--text-dim)]",
                )}
              >
                {isActive ? (
                  <span
                    className="absolute inset-0 rounded-lg"
                    style={{
                      background: "linear-gradient(90deg, rgba(255,45,85,.22), rgba(255,116,168,.05))",
                      boxShadow: "inset 0 0 0 1px rgba(255,45,85,.3)",
                    }}
                  />
                ) : null}
                {isActive ? (
                  <span
                    className="absolute -left-2 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full"
                    style={{ background: "var(--crit)", boxShadow: "0 0 12px 1px var(--crit)" }}
                  />
                ) : null}

                <Icon
                  className={cx("relative h-[17px] w-[17px] shrink-0 transition-colors", isActive && "text-[var(--crit)]")}
                />
                <span className="relative hidden truncate text-[10.5px] font-semibold uppercase tracking-[0.14em] xl:inline">
                  {page.label}
                </span>
                {page.badge ? (
                  <span
                    className="mt-num relative ml-auto hidden h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white xl:flex"
                    style={{ background: "var(--crit)", boxShadow: "0 0 12px -2px var(--crit)" }}
                  >
                    {page.badge}
                  </span>
                ) : null}
                {page.badge ? (
                  <span
                    className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full xl:hidden"
                    style={{ background: "var(--crit)", boxShadow: "0 0 8px 1px var(--crit)" }}
                  />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-hair mx-2 my-2.5" />

      <div className="flex items-center gap-2.5 px-2.5">
        <Avatar name={medic.name} size={30} ring />
        <div className="hidden min-w-0 flex-1 xl:block">
          <p className="truncate text-[10.5px] font-semibold text-[var(--text)]">{medic.name}</p>
          <p className="mt-num truncate text-[9px] text-[var(--text-faint)]">{medic.badge}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="End session"
          aria-label="End session"
          className="mt-btn hidden h-7 w-7 shrink-0 items-center justify-center rounded-md xl:flex"
        >
          <Power className="h-3 w-3" />
        </button>
      </div>
    </nav>
  );
}
