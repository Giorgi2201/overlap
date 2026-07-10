import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MapPin, ChevronRight, X, RotateCcw } from "lucide-react";
import type { PathStep } from "../lib/pathfinding";

interface SurrenderModalProps {
  open: boolean;
  onClose: () => void;
  onNewGame: () => void;
  path: PathStep[] | null;
  getPlayerName: (id: string) => string;
  getClubName: (id: string) => string;
}

export function SurrenderModal({
  open,
  onClose,
  onNewGame,
  path,
  getPlayerName,
  getClubName,
}: SurrenderModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!path) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-sm rounded-2xl bg-gradient-to-b from-slate-800 to-slate-900 border border-rose-500/30 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header */}
            <div className="flex flex-col items-center gap-3 mb-6">
              <div className="w-14 h-14 rounded-full bg-rose-500/15 border-2 border-rose-400/40 flex items-center justify-center">
                <MapPin className="w-7 h-7 text-rose-400" />
              </div>
              <div className="text-center">
                <h2 className="text-xl font-extrabold tracking-tight uppercase text-rose-400">
                  Solution Revealed
                </h2>
                <p className="text-xs font-mono uppercase tracking-wider text-slate-400 mt-1">
                  Shortest Path
                </p>
              </div>
            </div>

            {/* Shortest Path */}
            <div className="relative mb-6">
              <div className="absolute left-[19px] top-0 bottom-0 w-px bg-gradient-to-b from-rose-500/40 via-slate-600/30 to-rose-500/40" />
              <div className="flex flex-col gap-3">
                {path.map((step, i) => {
                  const isLast = i === path.length - 1;
                  const isFirst = i === 0;
                  const playerName = getPlayerName(step.playerId);

                  return (
                    <motion.div
                      key={`path-${step.playerId}-${i}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                      className="flex items-start gap-3 pl-1"
                    >
                      <div className="flex items-center justify-center w-[38px] shrink-0 pt-0.5">
                        <div
                          className={`w-2.5 h-2.5 rounded-full ${
                            isFirst
                              ? "bg-emerald-400"
                              : isLast
                                ? "bg-amber-400"
                                : "bg-slate-500"
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-semibold ${
                            isLast ? "text-amber-400" : "text-slate-200"
                          }`}
                        >
                          {playerName}
                        </p>
                        {step.clubId && !isLast && (
                          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                            via {getClubName(step.clubId)}
                          </span>
                        )}
                        {isLast && (
                          <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400/60">
                            TARGET
                          </span>
                        )}
                      </div>
                      {!isLast && (
                        <ChevronRight className="w-3 h-3 text-slate-600 shrink-0 mt-1" />
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-slate-700/50" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
                {path.length - 1} hop{path.length - 1 === 1 ? "" : "s"}
              </span>
              <div className="h-px flex-1 bg-slate-700/50" />
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onNewGame}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all duration-200 text-sm font-medium"
              >
                <RotateCcw className="w-4 h-4" />
                New Puzzle
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-all duration-200 text-xs font-medium"
              >
                Continue Playing
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
