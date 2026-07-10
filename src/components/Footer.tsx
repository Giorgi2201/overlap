import { Undo2, LogOut, Trophy } from "lucide-react";

interface FooterProps {
  canUndo: boolean;
  onUndo: () => void;
  onSurrender: () => void;
  hopCount: number;
  won: boolean;
  onPlayAgain: () => void;
}

export function Footer({
  canUndo,
  onUndo,
  onSurrender,
  hopCount,
  won,
  onPlayAgain,
}: FooterProps) {
  if (won) {
    return (
      <footer className="flex justify-center items-center px-6 py-4 bg-slate-950 border-t border-slate-900">
        <button
          type="button"
          onClick={onPlayAgain}
          className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 rounded-xl hover:bg-emerald-500/25 transition-all duration-200 font-semibold text-sm"
        >
          <Trophy className="w-4 h-4" />
          Play Again
        </button>
      </footer>
    );
  }

  return (
    <footer className="flex justify-between items-center px-4 sm:px-6 py-4 bg-slate-950 border-t border-slate-900">
      {/* Backtrack / Undo */}
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all duration-200 text-sm font-medium ${
          canUndo
            ? "bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20 active:scale-[0.97]"
            : "bg-slate-800/30 border-slate-800 text-slate-600 cursor-not-allowed"
        }`}
      >
        <Undo2 className="w-4 h-4" />
        <span className="hidden sm:inline">Backtrack</span>
      </button>

      {/* Hops counter */}
      <div className="flex items-center gap-2">
        <div className="px-3 py-1.5 bg-slate-800/50 border border-slate-700/50 rounded-lg">
          <span className="font-mono text-xs tracking-wider text-slate-400">
            {hopCount} {hopCount === 1 ? "hop" : "hops"}
          </span>
        </div>
      </div>

      {/* Surrender */}
      <button
        type="button"
        onClick={onSurrender}
        className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 text-slate-400 border border-slate-700/50 rounded-xl hover:bg-slate-800 hover:text-slate-200 transition-all duration-200 text-sm font-medium"
      >
        <LogOut className="w-4 h-4" />
        <span className="hidden sm:inline">Surrender</span>
      </button>
    </footer>
  );
}
