import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { AffiliationGraph } from "../lib/graph";
import { formatAffiliationYears } from "../lib/overlap";
import type { ChainNode, ExpandedView } from "../state/gameState";
import styles from "./ChainGraph.module.css";

export interface SatelliteOption {
  id: string;
  label: string;
  /** Flavor metadata (e.g. "2018–2021") — not a validity rule. */
  sublabel?: string;
  kind: "club" | "national_team" | "player";
  isDeadEnd: boolean;
}

interface ChainGraphProps {
  graph: AffiliationGraph;
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
 * Club names in graph-data: p75≈28, p90≈34, p95≈41, max≈98.
 * Label boxes sized for ~p90 at 2 lines; outliers get a hover/focus tooltip.
 */
export const LAYOUT = {
  PLAYER_R: 26,
  CLUB_R: 18,
  NT_R: 17,
  SAT_PLAYER_R: 22,
  SAT_CLUB_R: 16,
  SAT_NT_R: 15,
  PAD_X: 64,
  /** Fixed gap between consecutive chain nodes (never shrinks). */
  NODE_GAP: 192,
  CHAIN_Y: 78,
  /** ~p90 club names fit in 2 lines at this char budget. */
  LABEL_CHARS: 36,
  PLAYER_LABEL_CHARS: 24,
  /** Satellite column width sized for 2-line club labels near p90. */
  SAT_COL_W: 168,
  SAT_ROW_H: 92,
  LABEL_BOX_PX: 176,
} as const;

function labelFor(graph: AffiliationGraph, node: ChainNode): string {
  if (node.type === "player") return graph.players.get(node.id)?.name ?? node.id;
  return graph.entities.get(node.id)?.name ?? node.id;
}

function entityKind(
  graph: AffiliationGraph,
  node: ChainNode,
): "player" | "club" | "national_team" {
  if (node.type === "player") return "player";
  return graph.entities.get(node.id)?.type === "national_team"
    ? "national_team"
    : "club";
}

function yearsForChainEntity(
  graph: AffiliationGraph,
  chain: ChainNode[],
  entityIndex: number,
): string | null {
  const node = chain[entityIndex];
  if (!node || node.type !== "entity") return null;
  const entity = graph.entities.get(node.id);
  if (!entity || entity.type !== "club") return null;
  const prev = chain[entityIndex - 1];
  if (!prev || prev.type !== "player") return null;
  const aff = graph
    .getAffiliationsForPlayer(prev.id)
    .find((a) => a.entityId === node.id);
  return aff ? formatAffiliationYears(aff) : null;
}

function truncate(
  name: string,
  maxChars: number,
): { text: string; truncated: boolean } {
  if (name.length <= maxChars) return { text: name, truncated: false };
  return { text: `${name.slice(0, maxChars - 1)}…`, truncated: true };
}

/** Readable label with hover/focus tooltip when the full name doesn't fit. */
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
  const ref = useRef<HTMLSpanElement>(null);
  const [showTip, setShowTip] = useState(false);
  const { text, truncated: charTruncated } = truncate(full, maxChars);
  const [overflows, setOverflows] = useState(charTruncated);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setOverflows(charTruncated || el.scrollHeight > el.clientHeight + 1);
  }, [full, text, charTruncated, lines]);

  const needsTip = overflows || charTruncated;

  return (
    <span
      className={styles.labelShell}
      onMouseEnter={() => needsTip && setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
      onFocus={() => needsTip && setShowTip(true)}
      onBlur={() => setShowTip(false)}
      tabIndex={needsTip ? 0 : undefined}
      aria-label={needsTip ? full : undefined}
    >
      <span
        ref={ref}
        className={className}
        style={{ WebkitLineClamp: lines } as CSSProperties}
      >
        {text}
      </span>
      {showTip && needsTip ? (
        <span className={styles.tooltip} role="tooltip">
          {full}
        </span>
      ) : null}
    </span>
  );
}

function nodeRadius(kind: "player" | "club" | "national_team", sat: boolean): number {
  if (sat) {
    if (kind === "player") return LAYOUT.SAT_PLAYER_R;
    if (kind === "national_team") return LAYOUT.SAT_NT_R;
    return LAYOUT.SAT_CLUB_R;
  }
  if (kind === "player") return LAYOUT.PLAYER_R;
  if (kind === "national_team") return LAYOUT.NT_R;
  return LAYOUT.CLUB_R;
}

/** Club = circle; national team = rounded diamond (beacon stroke). */
function EntityShape({
  kind,
  cx,
  cy,
  r,
  className,
  interactive,
  onClick,
  onKeyDown,
  tabIndex,
  ariaLabel,
  ariaDisabled,
}: {
  kind: "player" | "club" | "national_team";
  cx: number;
  cy: number;
  r: number;
  className: string;
  interactive?: boolean;
  onClick?: () => void;
  onKeyDown?: (e: KeyboardEvent) => void;
  tabIndex?: number;
  ariaLabel?: string;
  ariaDisabled?: boolean;
}) {
  const shared = {
    className,
    onClick,
    onKeyDown,
    tabIndex: interactive ? tabIndex : undefined,
    role: interactive ? ("button" as const) : undefined,
    "aria-label": ariaLabel,
    "aria-disabled": ariaDisabled,
  };

  if (kind === "national_team") {
    const side = r * Math.SQRT2;
    return (
      <rect
        x={cx - side / 2}
        y={cy - side / 2}
        width={side}
        height={side}
        rx={3.5}
        transform={`rotate(45 ${cx} ${cy})`}
        {...shared}
      />
    );
  }

  return <circle cx={cx} cy={cy} r={r} {...shared} />;
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
  const dragRef = useRef<{ active: boolean; x: number; left: number }>({
    active: false,
    x: 0,
    left: 0,
  });
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
    const chainW = LAYOUT.PAD_X * 2 + Math.max(0, n - 1) * LAYOUT.NODE_GAP;
    return Math.max(viewportW, chainW);
  }, [chain.length, viewportW]);

  const chainPoints: Point[] = useMemo(() => {
    const n = Math.max(chain.length, 1);
    if (n === 1) {
      return [{ x: contentWidth / 2, y: LAYOUT.CHAIN_Y }];
    }
    const span = (n - 1) * LAYOUT.NODE_GAP;
    const startX =
      span + LAYOUT.PAD_X * 2 <= viewportW
        ? (contentWidth - span) / 2
        : LAYOUT.PAD_X;
    return chain.map((_, i) => ({
      x: startX + i * LAYOUT.NODE_GAP,
      y: LAYOUT.CHAIN_Y,
    }));
  }, [chain, contentWidth, viewportW]);

  const activeIndex = chain.length - 1;
  const activePoint = chainPoints[activeIndex] ?? {
    x: contentWidth / 2,
    y: LAYOUT.CHAIN_Y,
  };

  // Keep the newest chain node in view when the circuit grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || chain.length === 0) return;
    const target = chainPoints[activeIndex];
    if (!target) return;
    const left = el.scrollLeft;
    const right = left + el.clientWidth;
    const margin = 88;
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
      Math.min(4, Math.ceil(Math.sqrt(satellites.length * 1.05))),
    );
    const startY = LAYOUT.CHAIN_Y + 118;
    const gridW = (cols - 1) * LAYOUT.SAT_COL_W;
    const originX = Math.min(
      Math.max(activePoint.x - gridW / 2, LAYOUT.PAD_X),
      Math.max(LAYOUT.PAD_X, contentWidth - LAYOUT.PAD_X - gridW),
    );
    return satellites.map((s, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return {
        ...s,
        x: originX + col * LAYOUT.SAT_COL_W,
        y: startY + row * LAYOUT.SAT_ROW_H,
      };
    });
  }, [satellites, activePoint.x, contentWidth]);

  const canvasWidth = useMemo(() => {
    if (satelliteLayout.length === 0) return contentWidth;
    const maxX =
      Math.max(...satelliteLayout.map((s) => s.x)) + LAYOUT.SAT_COL_W / 2 + 28;
    return Math.max(contentWidth, maxX);
  }, [contentWidth, satelliteLayout]);

  const graphHeight = useMemo(() => {
    // Room for chain labels (+ optional years) under the spine.
    if (satelliteLayout.length === 0) return 200;
    const maxY = Math.max(...satelliteLayout.map((s) => s.y));
    return maxY + 64;
  }, [satelliteLayout]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = scrollRef.current;
    if (!el) return;
    // Don't steal clicks from satellite buttons.
    const t = e.target as Element;
    if (t.closest("circle, rect, [role='button']")) return;
    dragRef.current = { active: true, x: e.clientX, left: el.scrollLeft };
    el.setPointerCapture(e.pointerId);
    el.classList.add(styles.dragging);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const el = scrollRef.current;
    if (!el) return;
    const dx = e.clientX - dragRef.current.x;
    el.scrollLeft = dragRef.current.left - dx;
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    scrollRef.current?.classList.remove(styles.dragging);
    try {
      scrollRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  const prompt =
    expanded === null
      ? "Open the start player to begin the circuit."
      : expanded.kind === "entities"
        ? "Choose a club or national team they represented."
        : "Choose someone else affiliated with that entity.";

  return (
    <div className={styles.wrap}>
      <p className={styles.prompt}>{prompt}</p>
      <div
        className={styles.scroll}
        ref={scrollRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
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
              const kind = entityKind(graph, node);
              const r = nodeRadius(kind, false);
              const isActive = i === activeIndex && !won;
              return (
                <EntityShape
                  key={`node-${node.type}-${node.id}-${i}`}
                  kind={kind}
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  className={[
                    styles.node,
                    kind === "player"
                      ? styles.nodePlayer
                      : kind === "national_team"
                        ? styles.nodeNational
                        : styles.nodeClub,
                    isActive ? styles.nodeActive : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
              );
            })}

            {satelliteLayout.map((s) => {
              const r = nodeRadius(s.kind, true);
              return (
                <EntityShape
                  key={`sat-circle-${s.id}`}
                  kind={s.kind}
                  cx={s.x}
                  cy={s.y}
                  r={r}
                  interactive
                  className={[
                    styles.satellite,
                    s.kind === "national_team"
                      ? styles.satNational
                      : s.kind === "club"
                        ? styles.satClub
                        : "",
                    s.isDeadEnd ? styles.satDead : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => {
                    if (!s.isDeadEnd) onSelectSatellite(s.id);
                  }}
                  tabIndex={s.isDeadEnd ? -1 : 0}
                  ariaDisabled={s.isDeadEnd}
                  ariaLabel={`${s.label}${s.kind === "national_team" ? " (national team)" : s.kind === "club" ? " (club)" : ""}${s.isDeadEnd ? " — dead end" : ""}`}
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

          {chain.map((node, i) => {
            const p = chainPoints[i];
            const kind = entityKind(graph, node);
            const r = nodeRadius(kind, false);
            const full = labelFor(graph, node);
            const maxChars =
              kind === "player" ? LAYOUT.PLAYER_LABEL_CHARS : LAYOUT.LABEL_CHARS;
            const years = yearsForChainEntity(graph, chain, i);
            return (
              <div
                key={`label-${node.type}-${node.id}-${i}`}
                className={styles.chainLabel}
                style={{ left: p.x, top: p.y + r + 8 }}
              >
                <NameLabel
                  full={full}
                  maxChars={maxChars}
                  className={styles.chainLabelText}
                />
                {kind === "national_team" ? (
                  <span className={styles.kindBadge}>national team</span>
                ) : null}
                {years ? (
                  <span className={styles.years} title="Career years (flavor)">
                    {years}
                  </span>
                ) : null}
              </div>
            );
          })}

          {satelliteLayout.map((s) => {
            const r = nodeRadius(s.kind, true);
            const maxChars =
              s.kind === "player" ? LAYOUT.PLAYER_LABEL_CHARS : LAYOUT.LABEL_CHARS;
            return (
              <div
                key={`sat-label-${s.id}`}
                className={`${styles.satLabelWrap} ${s.isDeadEnd ? styles.satLabelWrapDead : ""}`}
                style={{ left: s.x, top: s.y + r + 6 }}
              >
                <NameLabel
                  full={s.label}
                  maxChars={maxChars}
                  className={styles.satLabelText}
                />
                {s.kind === "national_team" ? (
                  <span className={styles.kindBadge}>national team</span>
                ) : null}
                {s.sublabel ? (
                  <span
                    className={
                      s.kind === "player" ? styles.satMeta : styles.years
                    }
                    title={
                      s.kind === "club" ? "Career years (flavor)" : undefined
                    }
                  >
                    {s.sublabel}
                  </span>
                ) : null}
                {s.isDeadEnd ? (
                  <span className={styles.deadTag}>dead end</span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
