import { useState, useMemo } from "react";
import { Search, Users } from "lucide-react";
import type { Player } from "../lib/types";
import { PlayerAvatar } from "./PlayerAvatar";

interface RosterGridProps {
  players: Player[];
  clubName: string;
  onSelect: (playerId: string) => void;
  isDeadEnd?: (playerId: string) => boolean;
  targetPlayerId: string | null;
  isLoading?: boolean;
}

type PositionFilter = "all" | "Goalkeeper" | "Defender" | "Midfield" | "Attack";

const POSITION_FILTERS: { key: PositionFilter; label: string }[] = [
  { key: "all", label: "All Players" },
  { key: "Attack", label: "Forwards" },
  { key: "Midfield", label: "Midfielders" },
  { key: "Defender", label: "Defenders" },
  { key: "Goalkeeper", label: "Goalkeepers" },
];

export function RosterGrid({
  players,
  clubName,
  onSelect,
  isDeadEnd,
  targetPlayerId,
  isLoading = false,
}: RosterGridProps) {
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("all");

  const filteredPlayers = useMemo(() => {
    return players.filter((p) => {
      if (positionFilter !== "all" && p.position !== positionFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!p.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [players, search, positionFilter]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" />
        <p className="text-xs text-slate-500 font-mono uppercase tracking-wider">
          Loading roster...
        </p>
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <Users className="w-8 h-8 text-slate-600" />
        <p className="text-sm text-slate-500">No teammates found at {clubName}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Sticky Utility Bar */}
      <div className="sticky top-0 z-10 flex flex-col gap-3 bg-slate-950/90 backdrop-blur-md pb-2">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Search players..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/20 transition-colors"
          />
        </div>

        {/* Position Pills */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
          {POSITION_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setPositionFilter(key)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-wider transition-all duration-200 ${
                positionFilter === key
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/40"
                  : "bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:bg-slate-800 hover:text-slate-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Roster Grid */}
      <div className="flex-1 overflow-y-auto roster-scroll min-h-0 pr-1">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pb-4">
          {filteredPlayers.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-8 gap-2">
              <Search className="w-6 h-6 text-slate-600" />
              <p className="text-sm text-slate-500">No players match your search</p>
            </div>
          ) : (
            filteredPlayers.map((player) => {
              const deadEnd = isDeadEnd?.(player.id) ?? false;
              const isTarget = player.id === targetPlayerId;

              return (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => !deadEnd && onSelect(player.id)}
                  disabled={deadEnd}
                  className={`group flex items-center gap-3 p-2.5 rounded-xl border transition-all duration-200 ${
                    deadEnd
                      ? "bg-rose-500/5 border-rose-500/20 opacity-50 cursor-not-allowed"
                      : isTarget
                        ? "bg-amber-500/10 border-amber-500/40 hover:bg-amber-500/15 cursor-pointer shadow-[0_0_12px_rgba(251,191,36,0.1)]"
                        : "bg-slate-900/60 border-slate-800 hover:bg-slate-800/80 hover:border-emerald-500/40 hover:shadow-[0_0_12px_rgba(16,185,129,0.12)] cursor-pointer active:scale-[0.98]"
                  }`}
                >
                  <PlayerAvatar
                    name={player.name}
                    size="sm"
                    glow={isTarget ? "beacon" : "none"}
                  />
                  <div className="min-w-0 flex-1 text-left">
                    <p
                      className={`text-xs font-semibold truncate leading-tight ${
                        deadEnd ? "text-slate-500" : isTarget ? "text-amber-300" : "text-slate-200"
                      }`}
                    >
                      {player.name}
                    </p>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                      {player.position}
                    </span>
                    {isTarget && (
                      <span className="ml-1.5 text-[10px] font-mono uppercase tracking-wider text-amber-400/80">
                        TARGET
                      </span>
                    )}
                  </div>
                  {deadEnd && (
                    <div className="px-1.5 py-0.5 bg-rose-500/20 border border-rose-500/30 rounded text-[9px] font-mono uppercase tracking-wider text-rose-400 shrink-0">
                      dead end
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
