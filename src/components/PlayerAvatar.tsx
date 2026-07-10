interface PlayerAvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  glow?: "signal" | "beacon" | "none";
  isAnimated?: boolean;
  className?: string;
}

const sizeMap = {
  sm: "w-8 h-8 text-[10px]",
  md: "w-12 h-12 text-xs",
  lg: "w-16 h-16 text-sm",
};

const glowMap = {
  signal:
    "ring-1 ring-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]",
  beacon:
    "ring-1 ring-amber-400/50 shadow-[0_0_12px_rgba(251,191,36,0.25)]",
  none: "",
};

const beaconPulse =
  "animate-[beaconPulse_2s_ease-in-out_infinite]";

/** Extract initials (up to 2 chars) from a full name. */
function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function PlayerAvatar({
  name,
  size = "md",
  glow = "none",
  isAnimated = false,
  className = "",
}: PlayerAvatarProps) {
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-800 font-display font-bold text-slate-200 ${sizeMap[size]} ${glowMap[glow]} ${isAnimated ? beaconPulse : ""} ${className}`}
    >
      {initials(name)}
    </div>
  );
}
