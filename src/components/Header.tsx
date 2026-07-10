import { Crosshair, Flag } from "lucide-react";
import type { ChainNode } from "../state/gameState";
import { BreadcrumbTracker } from "./BreadcrumbTracker";
import { PlayerAvatar } from "./PlayerAvatar";

interface HeaderProps {
  startPlayerName: string;
  targetPlayerName: string;
  chain: ChainNode[];
  getLabel: (node: ChainNode) => string;
  getTypeLabel: (node: ChainNode) => string;
}

export function Header({
  startPlayerName,
  targetPlayerName,
  chain,
  getLabel,
  getTypeLabel,
}: HeaderProps) {
  return (
    <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md z-20 min-h-[68px]">
      {/* Left: Start Player */}
      <div className="flex items-center gap-2.5 min-w-0">
        <PlayerAvatar name={startPlayerName} size="sm" glow="signal" />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Crosshair className="w-3 h-3 text-emerald-400 shrink-0" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400/80">
              Start
            </span>
          </div>
          <p className="text-xs font-semibold text-slate-200 truncate leading-tight">
            {startPlayerName}
          </p>
        </div>
      </div>

      {/* Center: Breadcrumb Path Tracker */}
      <div className="hidden sm:flex items-center justify-center max-w-[40vw] overflow-hidden">
        <BreadcrumbTracker
          chain={chain}
          getLabel={getLabel}
          getTypeLabel={getTypeLabel}
        />
      </div>

      {/* Right: Target Player */}
      <div className="flex items-center justify-end gap-2.5 min-w-0">
        <div className="min-w-0 text-right">
          <div className="flex items-center justify-end gap-1.5">
            <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400/80">
              Target
            </span>
            <Flag className="w-3 h-3 text-amber-400 shrink-0" />
          </div>
          <p className="text-xs font-semibold text-slate-200 truncate leading-tight">
            {targetPlayerName}
          </p>
        </div>
        <PlayerAvatar name={targetPlayerName} size="sm" glow="beacon" isAnimated />
      </div>

      {/* Mobile Breadcrumb (shown below header on small screens) */}
      <div className="col-span-full sm:hidden flex items-center justify-center pt-1 border-t border-slate-800/50 mt-1">
        <BreadcrumbTracker
          chain={chain}
          getLabel={getLabel}
          getTypeLabel={getTypeLabel}
        />
      </div>
    </header>
  );
}
