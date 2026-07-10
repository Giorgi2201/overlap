import { useEffect, useState } from "react";
import {
  Trophy,
  CheckCircle2,
  Share2,
  X,
  ChevronRight,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { ChainNode } from "../state/gameState";

interface VictoryModalProps {
  open: boolean;
  onClose: () => void;
  chain: ChainNode[];
  getLabel: (node: ChainNode) => string;
  startPlayerName: string;
  targetPlayerName: string;
  hopCount: number;
}

export function VictoryModal({
  open,
  onClose,
  chain,
  getLabel,
  startPlayerName: _startPlayerName,
  targetPlayerName: _targetPlayerName,
  hopCount,
}: VictoryModalProps) {
  const [copied, setCopied] = useState(false);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const pathString = chain
    .map((n) => getLabel(n))
    .join(" -> ");

  const shareText = [
    "OVERLAP - Degree Matched",
    "",
    `Path: ${pathString}`,
    `Solved in ${hopCount} hop${hopCount === 1 ? "" : "s"}`,
    "",
    "playoverlap.com",
  ].join("\n");

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement("textarea");
      textarea.value = shareText;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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
            className="relative w-full max-w-sm rounded-2xl bg-gradient-to-b from-slate-800 to-slate-900 border border-emerald-500/30 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header */}
            <div className="flex flex-col items-center gap-3 mb-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", damping: 15, stiffness: 200, delay: 0.15 }}
              >
                <div className="w-14 h-14 rounded-full bg-emerald-500/15 border-2 border-emerald-400/40 flex items-center justify-center">
                  <Trophy className="w-7 h-7 text-emerald-400" />
                </div>
              </motion.div>
              <div className="text-center">
                <h2 className="text-2xl font-extrabold tracking-tight uppercase text-emerald-400">
                  Degree Matched
                </h2>
                <p className="text-xs font-mono uppercase tracking-wider text-slate-400 mt-1">
                  Circuit Closed
                </p>
              </div>
            </div>

            {/* Path Visualization */}
            <div className="relative mb-6">
              <div className="absolute left-[19px] top-0 bottom-0 w-px bg-gradient-to-b from-emerald-500/60 via-emerald-500/30 to-emerald-500/60" />
              <div className="flex flex-col gap-3">
                {chain.map((node, i) => {
                  const isLast = i === chain.length - 1;
                  const label = getLabel(node);
                  const typeIcon =
                    node.type === "player" ? (
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    ) : (
                      <div className="w-2.5 h-2.5 rounded-sm bg-slate-500 rotate-45" />
                    );

                  return (
                    <motion.div
                      key={`path-${node.type}-${node.id}-${i}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 + i * 0.08 }}
                      className="flex items-start gap-3 pl-1"
                    >
                      <div className="flex items-center justify-center w-[38px] shrink-0 pt-0.5">
                        {typeIcon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-semibold ${
                            isLast ? "text-emerald-400" : "text-slate-200"
                          }`}
                        >
                          {label}
                        </p>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                          {node.type === "player" ? "Player" : "Club"}
                        </span>
                      </div>
                      {!isLast && (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0 mt-1" />
                      )}
                      {isLast && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
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
                {hopCount} hop{hopCount === 1 ? "" : "s"}
              </span>
              <div className="h-px flex-1 bg-slate-700/50" />
            </div>

            {/* Share Button */}
            <button
              type="button"
              onClick={handleShare}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border transition-all duration-200 text-sm font-medium ${
                copied
                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                  : "bg-slate-800/50 border-slate-700/50 text-slate-300 hover:bg-slate-800 hover:border-slate-600"
              }`}
            >
              <Share2 className="w-4 h-4" />
              {copied ? "Copied to clipboard!" : "Share Result"}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
