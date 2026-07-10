import { useCallback, useRef, useState, type CSSProperties, type MouseEvent, type RefObject } from "react";

interface TiltState {
  rotateX: number;
  rotateY: number;
}

const IDLE: TiltState = { rotateX: 0, rotateY: 0 };

/**
 * Subtle 3D card tilt that tracks the pointer. No-ops when the user
 * prefers reduced motion.
 */
export function useTilt(maxDeg = 8): {
  ref: RefObject<HTMLDivElement | null>;
  style: CSSProperties;
  onMouseMove: (e: MouseEvent) => void;
  onMouseLeave: () => void;
} {
  const ref = useRef<HTMLDivElement | null>(null);
  const [tilt, setTilt] = useState<TiltState>(IDLE);
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (reduced || !ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      setTilt({ rotateX: -(py * maxDeg * 2), rotateY: px * maxDeg * 2 });
    },
    [maxDeg, reduced],
  );

  const onMouseLeave = useCallback(() => setTilt(IDLE), []);

  return {
    ref,
    style: {
      transform: `perspective(900px) rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg)`,
      transition: reduced ? undefined : "transform 120ms ease-out",
    },
    onMouseMove,
    onMouseLeave,
  };
}
