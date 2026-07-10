import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { TenureGraph } from "../lib/graph";
import type { ChainNode, ExpandedView } from "../state/gameState";
import styles from "./ChainGraph.module.css";

export interface SatelliteOption {
  id: string;
  label: string;
  sublabel?: string;
  kind: "club" | "player";
  isDeadEnd: boolean;
}

interface ChainGraphProps {
  graph: TenureGraph;
  chain: ChainNode[];
  expanded: ExpandedView | null;
  satellites: SatelliteOption[];
  won: boolean;
  onSelectSatellite: (id: string) => void;
}

interface Point {
  x: number;
  y: number;
}

/**
 * Layout constants — fixed sizes so a 6-hop chain (13 nodes) stays readable.
 * Club names in graph-data: p75=28, p90=34, p95=41, max=98.
 * Labels allow ~34 chars / 2 lines (~p90); longer names get a tooltip.
 */
const PLAYER_R = 26;
const CLUB_R = 18;
const SAT_PLAYER_R = 22;
const SAT_CLUB_R = 17;
const PAD_X = 56;
/** Fixed gap between consecutive chain nodes (never shrinks). */
const NODE_GAP = 168;
const CHAIN_Y = 70;
/** Max characters shown before ellipsis — covers ~90% of club names. */
const CLUB_LABEL_CHARS = 34;
const PLAYER_LABEL_CHARS = 22;
/** Satellite column width sized for 2-line club labels near p90 length. */
const SAT_COL_W = 148;
const SAT_ROW_H = 78;

function labelFor(graph: TenureGraph, node: ChainNode): string {
  if (node.type === "player") return graph.players.get(node.id)?.name ?? node.id;
  return graph.clubs.get(node.id)?.name ?? node.id;
}

function truncate(name: string, maxChars: number): { text: string; truncated: boolean } {
  if (name.length <= maxChars) return { text: name, truncated: false };
  return { text: `${name.slice(0, maxChars - 1)}…`, truncated: true };
}

function NameLabel({
  full,
  maxChars,
  className,
  lines = 2,
}: {
  full: string;
  maxChars: number;
  className: string;
  lines?: number;
}) {
  const { text, truncated } = truncate(full, maxChars);
  return (
    <span
      className={className}
      title={truncated || full.length > 20 ? full : undefined}
      style={{ WebkitLineClamp: lines }}
    >
      {text}
    </span>
  );
}

export function ChainGraph({
  graph,
  chain,
  expanded,
  satellites,
  won,
  onSelectSatellite,
}: ChainGraphProps) {
  const uid = useId().replace(/:/g, "");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewportW, setViewportW] = useState(640);
  const [animateEdge, setAnimateEdge] = useState<number | null>(null);
  const prevLen = useRef(chain.length);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setViewportW(Math.max(280, entry.contentRect.width));
    });
    ro.observe(el);
    setViewportW(Math.max(280, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (chain.length > prevLen.current) {
      setAnimateEdge(chain.length - 2);
    } else {
      setAnimateEdge(null);
    }
    prevLen.current = chain.length;
  }, [chain.length]);

  // Content width grows with the chain; never compresses nodes.
  const contentWidth = useMemo(() => {
    const n = Math.max(chain.length, 1);
    const chainW = PAD_X * 2 + Math.max(0, n - 1) * NODE_GAP;
    return Math.max(viewportW, chainW);
  }, [chain.length, viewportW]);

  const chainPoints: Point[] = useMemo(() => {
    const n = Math.max(chain.length, 1);
    if (n === 1) {
      return [{ x: contentWidth / 2, y: CHAIN_Y }];
    }
    // Prefer centering a short chain in the viewport; long chains start at PAD_X.
    const span = (n - 1) * NODE_GAP;
    const startX =
      span + PAD_X * 2 <= viewportW
        ? (contentWidth - span) / 2
        : PAD_X;
    return chain.map((_, i) => ({
      x: startX + i * NODE_GAP,
      y: CHAIN_Y,
    }));
  }, [chain, contentWidth, viewportW]);

  const activeIndex = chain.length - 1;
  const activePoint = chainPoints[activeIndex] ?? { x: contentWidth / 2, y: CHAIN_Y };

  // Keep the newest chain node in view when the circuit grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || chain.length === 0) return;
    const target = chainPoints[activeIndex];
    if (!target) return;
    const left = el.scrollLeft;
    const right = left + el.clientWidth;
    const margin = 72;
    if (target.x - margin < left || target.x + margin > right) {
      el.scrollTo({
        left: Math.max(0, target.x - el.clientWidth * 0.55),
        behavior: "smooth",
      });
    }
  }, [chain.length, activeIndex, chainPoints]);

  const satelliteLayout = useMemo(() => {
    if (satellites.length === 0) return [];
    const cols = Math.max(
      2,
      Math.min(5, Math.ceil(Math.sqrt(satellites.length * 1.1))),
    );
    const startY = CHAIN_Y + 100;
    const gridW = (cols - 1) * SAT_COL_W;
    // Anchor the constellation under the active node, clamped into content.
    const originX = Math.min(
      Math.max(activePoint.x - gridW / 2, PAD_X),
      Math.max(PAD_X, contentWidth - PAD_X - gridW),
    );
    return satellites.map((s, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return {
        ...s,
        x: originX + col * SAT_COL_W,
        y: startY + row * SAT_ROW_H,
      };
    });
  }, [satellites, activePoint.x, contentWidth]);

  // Satellites may extend past the chain width — grow the canvas.
  const canvasWidth = useMemo(() => {
    if (satelliteLayout.length === 0) return contentWidth;
    const maxX = Math.max(...satelliteLayout.map((s) => s.x)) + SAT_COL_W / 2 + 24;
    return Math.max(contentWidth, maxX);
  }, [contentWidth, satelliteLayout]);

  const graphHeight = useMemo(() => {
    if (satelliteLayout.length === 0) return 150;
    const maxY = Math.max(...satelliteLayout.map((s) => s.y));
    return maxY + 52;
  }, [satelliteLayout]);

  const prompt =
    expanded === null
      ? "Open the start player to begin the circuit."
      : expanded.kind === "clubs"
        ? "Choose a club they actually played for."
        : "Choose a teammate who overlapped there.";

  return (
    <div className={styles.wrap}>
      <p className={styles.prompt}>{prompt}</p>
      <div className={styles.scroll} ref={scrollRef}>
        <div
          className={styles.canvas}
          style={{ width: canvasWidth, height: graphHeight }}
        >
          <svg
            className={styles.svg}
            width={canvasWidth}
            height={graphHeight}
            viewBox={`0 0 ${canvasWidth} ${graphHeight}`}
            role="img"
            aria-label="Connection graph"
          >
            <defs>
              <filter id={`glow-${uid}`} x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <linearGradient id={`edge-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--signal)" stopOpacity="0.35" />
                <stop offset="50%" stopColor="var(--signal)" stopOpacity="1" />
                <stop offset="100%" stopColor="var(--signal)" stopOpacity="0.55" />
              </linearGradient>
            </defs>

            {satelliteLayout.map((s) => (
              <line
                key={`spoke-${s.id}`}
                className={s.isDeadEnd ? styles.spokeDead : styles.spoke}
                x1={activePoint.x}
                y1={activePoint.y}
                x2={s.x}
                y2={s.y}
              />
            ))}

            {chainPoints.slice(0, -1).map((from, i) => {
              const to = chainPoints[i + 1];
              const isNewest = i === animateEdge;
              const d = `M ${from.x} ${from.y} C ${(from.x + to.x) / 2} ${from.y - 18}, ${(from.x + to.x) / 2} ${to.y - 18}, ${to.x} ${to.y}`;
              return (
                <path
                  key={`edge-${i}-${chain[i + 1]?.id}`}
                  className={`${styles.edge} ${isNewest ? styles.edgeDraw : ""} ${won && i === chainPoints.length - 2 ? styles.edgeWin : ""}`}
                  d={d}
                  fill="none"
                  stroke={`url(#edge-${uid})`}
                  strokeWidth={2.5}
                  filter={`url(#glow-${uid})`}
                  pathLength={1}
                />
              );
            })}

            {chain.map((node, i) => {
              const p = chainPoints[i];
              const r = node.type === "player" ? PLAYER_R : CLUB_R;
              const isActive = i === activeIndex && !won;
              return (
                <circle
                  key={`node-${node.type}-${node.id}-${i}`}
                  className={[
                    styles.node,
                    node.type === "player" ? styles.nodePlayer : styles.nodeClub,
                    isActive ? styles.nodeActive : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  cx={p.x}
                  cy={p.y}
                  r={r}
                />
              );
            })}

            {satelliteLayout.map((s) => {
              const r = s.kind === "player" ? SAT_PLAYER_R : SAT_CLUB_R;
              return (
                <circle
                  key={`sat-circle-${s.id}`}
                  className={[
                    styles.satellite,
                    s.kind === "club" ? styles.satClub : "",
                    s.isDeadEnd ? styles.satDead : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  cx={s.x}
                  cy={s.y}
                  r={r}
                  onClick={() => {
                    if (!s.isDeadEnd) onSelectSatellite(s.id);
                  }}
                  role="button"
                  tabIndex={s.isDeadEnd ? -1 : 0}
                  aria-disabled={s.isDeadEnd}
                  aria-label={`${s.label}${s.isDeadEnd ? " (dead end)" : ""}`}
                  onKeyDown={(e) => {
                    if (!s.isDeadEnd && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onSelectSatellite(s.id);
                    }
                  }}
                />
              );
            })}
          </svg>

          {/* HTML labels — readable width + native tooltip for outliers */}
          {chain.map((node, i) => {
            const p = chainPoints[i];
            const r = node.type === "player" ? PLAYER_R : CLUB_R;
            const full = labelFor(graph, node);
            const maxChars = node.type === "club" ? CLUB_LABEL_CHARS : PLAYER_LABEL_CHARS;
            return (
              <div
                key={`label-${node.type}-${node.id}-${i}`}
                className={styles.chainLabel}
                style={{ left: p.x, top: p.y + r + 6 }}
              >
                <NameLabel
                  full={full}
                  maxChars={maxChars}
                  className={styles.chainLabelText}
                />
              </div>
            );
          })}

          {satelliteLayout.map((s) => {
            const r = s.kind === "player" ? SAT_PLAYER_R : SAT_CLUB_R;
            const maxChars = s.kind === "club" ? CLUB_LABEL_CHARS : PLAYER_LABEL_CHARS;
            return (
              <div
                key={`sat-label-${s.id}`}
                className={`${styles.satLabelWrap} ${s.isDeadEnd ? styles.satLabelWrapDead : ""}`}
                style={{ left: s.x, top: s.y + r + 4 }}
              >
                <NameLabel
                  full={s.label}
                  maxChars={maxChars}
                  className={styles.satLabelText}
                />
                {s.isDeadEnd ? <span className={styles.deadTag}>dead end</span> : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
