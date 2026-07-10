import { ChevronRight } from "lucide-react";
import type { ChainNode } from "../state/gameState";

interface BreadcrumbTrackerProps {
  chain: ChainNode[];
  getLabel: (node: ChainNode) => string;
  getTypeLabel: (node: ChainNode) => string;
}

export function BreadcrumbTracker({
  chain,
  getLabel,
  getTypeLabel,
}: BreadcrumbTrackerProps) {
  if (chain.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none max-w-full">
      {chain.map((node, i) => {
        const isLast = i === chain.length - 1;
        const label = getLabel(node);
        const typeLabel = getTypeLabel(node);

        return (
          <div key={`${node.type}-${node.id}-${i}`} className="flex items-center gap-1.5 shrink-0">
            {i > 0 && (
              <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
            )}
            <div className="flex flex-col items-start min-w-0">
              <span
                className={`text-[11px] leading-tight whitespace-nowrap font-medium ${
                  isLast ? "text-emerald-400" : "text-slate-300"
                }`}
              >
                {label}
              </span>
              <span className="text-[9px] leading-tight text-slate-500 uppercase tracking-wider">
                {typeLabel}
              </span>
            </div>
          </div>
        );
      })}

      {/* End target indicator */}
      <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
      <div className="w-2 h-2 rounded-full bg-amber-400/60 shrink-0" />
    </div>
  );
}
