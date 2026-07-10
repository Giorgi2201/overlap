import { User, Crosshair, Flag } from "lucide-react";
import type { Player, Club } from "../lib/types";
import { EntityGrid } from "./EntityGrid";
import { PlayerAvatar } from "./PlayerAvatar";

interface PlayerProfileProps {
  player: Player;
  clubs: Club[];
  onSelectClub: (clubId: string) => void;
  isDeadEndClub?: (clubId: string) => boolean;
  isStart?: boolean;
  isTarget?: boolean;
  isLoading?: boolean;
}

export function PlayerProfile({
  player,
  clubs,
  onSelectClub,
  isDeadEndClub,
  isStart = false,
  isTarget = false,
  isLoading = false,
}: PlayerProfileProps) {
  const roleLabel = isStart ? "Start Player" : isTarget ? "Target Player" : "Connection";
  const roleColor = isTarget ? "text-amber-400" : "text-emerald-400";

  return (
    <div className="flex flex-col items-center w-full max-w-sm mx-auto gap-5">
      {/* Premium Player Card */}
      <div className="relative w-full rounded-2xl bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-700 p-6 shadow-xl overflow-hidden">
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/3 to-transparent pointer-events-none" />

        <div className="relative flex flex-col items-center gap-4">
          {/* Role badge */}
          <div className="flex items-center gap-1.5">
            {isStart ? (
              <Crosshair className={`w-3.5 h-3.5 ${roleColor}`} />
            ) : isTarget ? (
              <Flag className={`w-3.5 h-3.5 ${roleColor}`} />
            ) : (
              <User className={`w-3.5 h-3.5 ${roleColor}`} />
            )}
            <span className={`text-[10px] font-mono uppercase tracking-widest ${roleColor}`}>
              {roleLabel}
            </span>
          </div>

          {/* Avatar */}
          <PlayerAvatar
            name={player.name}
            size="lg"
            glow={isTarget ? "beacon" : "signal"}
            isAnimated={isTarget}
          />

          {/* Player Info */}
          <div className="text-center">
            <h2 className="text-xl font-extrabold tracking-tight uppercase text-slate-100">
              {player.name}
            </h2>
            {player.position && (
              <p className="text-sm font-mono uppercase tracking-wider text-slate-400 mt-1">
                {player.position}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Entity Selection Section */}
      <div className="w-full">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-px flex-1 bg-slate-800" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500 shrink-0">
            Select Connection Entity
          </span>
          <div className="h-px flex-1 bg-slate-800" />
        </div>

        <EntityGrid
          clubs={clubs}
          onSelect={onSelectClub}
          isDeadEnd={isDeadEndClub}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
