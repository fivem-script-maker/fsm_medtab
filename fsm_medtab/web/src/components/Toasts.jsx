import { AnimatePresence, motion } from "framer-motion";
import { CircleCheck, Info, TriangleAlert, X } from "lucide-react";

const TONES = {
  ok: { color: "var(--ok)", icon: CircleCheck },
  warn: { color: "var(--warn)", icon: TriangleAlert },
  crit: { color: "var(--crit)", icon: TriangleAlert },
  info: { color: "var(--pink)", icon: Info },
};

export default function Toasts({ items, onDismiss }) {
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-50 flex w-[min(320px,calc(100%-24px))] flex-col gap-2">
      <AnimatePresence initial={false}>
        {items.map((toast) => {
          const tone = TONES[toast.tone] || TONES.info;
          const Icon = tone.icon;
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 28, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 28, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="mt-panel pointer-events-auto relative flex items-start gap-2.5 overflow-hidden rounded-xl px-3 py-2.5"
              style={{ borderColor: `color-mix(in srgb, ${tone.color} 34%, transparent)` }}
            >
              <span className="absolute inset-y-0 left-0 w-[2px]" style={{ background: tone.color }} />
              <Icon className="mt-[1px] h-3.5 w-3.5 shrink-0" style={{ color: tone.color }} />
              <div className="min-w-0 flex-1">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.13em]" style={{ color: tone.color }}>
                  {toast.title}
                </p>
                {toast.body ? (
                  <p className="mt-0.5 text-[10.5px] leading-snug text-[var(--text-dim)]">{toast.body}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                aria-label="Dismiss notification"
                className="shrink-0 text-[var(--text-faint)] transition-colors hover:text-[var(--text)]"
              >
                <X className="h-3 w-3" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
