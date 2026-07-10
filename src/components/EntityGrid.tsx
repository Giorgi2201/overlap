import { Building2, Globe } from "lucide-react";
import type { Club } from "../lib/types";

interface EntityGridProps {
  clubs: Club[];
  onSelect: (clubId: string) => void;
  isDeadEnd?: (clubId: string) => boolean;
  isLoading?: boolean;
}

export function EntityGrid({
  clubs,
  onSelect,
  isDeadEnd,
  isLoading = false,
}: EntityGridProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3">
        <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" />
        <p className="text-xs text-slate-500 font-mono uppercase tracking-wider">
          Loading clubs...
        </p>
      </div>
    );
  }

  if (clubs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2">
        <Building2 className="w-8 h-8 text-slate-600" />
        <p className="text-sm text-slate-500">No clubs found for this player</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {clubs.map((club) => {
        const deadEnd = isDeadEnd?.(club.id) ?? false;
        return (
          <button
            key={club.id}
            type="button"
            onClick={() => !deadEnd && onSelect(club.id)}
            disabled={deadEnd}
            className={`group relative flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-200 ${
              deadEnd
                ? "bg-rose-500/5 border-rose-500/20 opacity-50 cursor-not-allowed"
                : "bg-slate-800/40 border-slate-700/50 hover:scale-[1.02] hover:border-emerald-500/60 hover:bg-slate-800/70 hover:shadow-[0_0_15px_rgba(16,185,129,0.15)] cursor-pointer active:scale-[0.98]"
            }`}
          >
            {/* Club icon */}
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                deadEnd
                  ? "bg-rose-500/10"
                  : "bg-slate-700/50 group-hover:bg-emerald-500/10"
              } transition-colors duration-200`}
            >
              {club.country === "International" ? (
                <Globe className="w-5 h-5 text-slate-400" />
              ) : (
                <Building2 className="w-5 h-5 text-slate-400" />
              )}
            </div>

            {/* Club name */}
            <span
              className={`text-xs font-semibold text-center leading-tight line-clamp-2 ${
                deadEnd ? "text-slate-500" : "text-slate-200"
              }`}
            >
              {club.name}
            </span>

            {/* Country tag */}
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
              {club.country}
            </span>

            {/* Dead end badge */}
            {deadEnd && (
              <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-rose-500/20 border border-rose-500/30 rounded text-[9px] font-mono uppercase tracking-wider text-rose-400">
                dead end
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
