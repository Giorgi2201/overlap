import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import styles from "./ConnectionPanel.module.css";

/** Show search once the grid is large enough that scanning by eye is slow. */
export const OPTIONS_SEARCH_THRESHOLD = 8;

/**
 * Quiet mono label on national-team chips/options — signals that NT links
 * ignore dates (vs club year ranges). Keep short; matches chipYears tone.
 */
export const NT_ANY_ERA_LABEL = "any era";

export interface OptionCard {
  id: string;
  label: string;
  /** Flavor metadata: years for clubs, position for teammates. */
  sublabel?: string;
  kind: "club" | "national_team" | "player";
  isDeadEnd: boolean;
}

export interface BreadcrumbChip {
  key: string;
  label: string;
  kind: "club" | "national_team" | "player";
  /** Club career years — flavor only. */
  years?: string | null;
  /** Tail of the chain (current position). */
  active?: boolean;
}

interface ConnectionPanelProps {
  chips: BreadcrumbChip[];
  options: OptionCard[];
  /** Changes when the options list context changes (clears search). */
  optionsKey: string;
  prompt: string;
  won: boolean;
  onSelectOption: (id: string) => void;
}

function KindMark({ kind }: { kind: BreadcrumbChip["kind"] }) {
  if (kind === "national_team") {
    return <span className={styles.markNational} aria-hidden="true" />;
  }
  if (kind === "club") {
    return <span className={styles.markClub} aria-hidden="true" />;
  }
  return <span className={styles.markPlayer} aria-hidden="true" />;
}

/** Read-only breadcrumb chip row — used in-game and on the win-screen reveal. */
export function PathChipRow({
  chips,
  ariaLabel = "Connection path",
  className,
}: {
  chips: readonly BreadcrumbChip[];
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <nav
      className={[styles.breadcrumb, className].filter(Boolean).join(" ")}
      aria-label={ariaLabel}
    >
      {chips.map((chip, i) => (
        <div key={chip.key} className={styles.crumbItem}>
          {i > 0 ? (
            <span className={styles.chevron} aria-hidden="true">
              ›
            </span>
          ) : null}
          <span
            className={[
              styles.chip,
              chip.kind === "player"
                ? styles.chipPlayer
                : chip.kind === "national_team"
                  ? styles.chipNational
                  : styles.chipClub,
              chip.active ? styles.chipActive : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <KindMark kind={chip.kind} />
            <span className={styles.chipBody}>
              <span className={styles.chipName}>{chip.label}</span>
              {chip.kind === "national_team" ? (
                <span className={styles.chipMeta}>{NT_ANY_ERA_LABEL}</span>
              ) : null}
              {chip.years ? (
                <span className={styles.chipYears}>{chip.years}</span>
              ) : null}
            </span>
          </span>
        </div>
      ))}
    </nav>
  );
}

function TruncatingName({
  name,
  className,
  lines = 2,
}: {
  name: string;
  className: string;
  lines?: number;
}) {
  const needsTip = name.length > 28;
  return (
    <span
      className={className}
      title={needsTip ? name : undefined}
      style={{ WebkitLineClamp: lines } as CSSProperties}
    >
      {name}
    </span>
  );
}

/** Case-insensitive substring filter on name. Dead-ends stay in the result set. */
export function filterOptionsByQuery(
  options: readonly OptionCard[],
  query: string,
): OptionCard[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...options];
  return options.filter((o) => o.label.toLowerCase().includes(q));
}

function prefersKeyboardAutofocus(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  // Autofocus on touch opens the soft keyboard and shoves the viewport —
  // only do it for fine-pointer / hover devices.
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

/**
 * Fixed-viewport connection UI: single-row horizontal breadcrumb + scrollable
 * options grid. No spatial canvas, SVG edges, or page-level pan/scroll.
 */
export function ConnectionPanel({
  chips,
  options,
  optionsKey,
  prompt,
  won,
  onSelectOption,
}: ConnectionPanelProps) {
  const [query, setQuery] = useState("");
  const [crumbOverflow, setCrumbOverflow] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const crumbScrollRef = useRef<HTMLElement>(null);
  const crumbTailRef = useRef<HTMLDivElement>(null);
  const showSearch = options.length >= OPTIONS_SEARCH_THRESHOLD;

  useEffect(() => {
    setQuery("");
  }, [optionsKey]);

  useEffect(() => {
    if (!showSearch || won) return;
    if (!prefersKeyboardAutofocus()) return;
    searchRef.current?.focus({ preventScroll: true });
  }, [optionsKey, showSearch, won]);

  // Keep the newest chip in view; re-measure overflow affordance.
  useEffect(() => {
    const scroller = crumbScrollRef.current;
    const tail = crumbTailRef.current;
    if (!scroller) return;

    const measure = () => {
      setCrumbOverflow(scroller.scrollWidth > scroller.clientWidth + 2);
    };

    measure();
    if (tail) {
      tail.scrollIntoView({
        behavior: "smooth",
        inline: "end",
        block: "nearest",
      });
    }

    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    scroller.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro.disconnect();
      scroller.removeEventListener("scroll", measure);
    };
  }, [chips.length, chips[chips.length - 1]?.key]);

  const filtered = useMemo(
    () => filterOptionsByQuery(options, query),
    [options, query],
  );

  const select = (id: string) => {
    setQuery("");
    onSelectOption(id);
  };

  return (
    <div className={styles.panel}>
      {prompt ? <p className={styles.prompt}>{prompt}</p> : null}

      <div
        className={[
          styles.breadcrumbShell,
          crumbOverflow ? styles.breadcrumbOverflow : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <nav
          ref={crumbScrollRef}
          className={styles.breadcrumb}
          aria-label="Connection path"
        >
          {chips.map((chip, i) => {
            const isTail = i === chips.length - 1;
            return (
              <div
                key={chip.key}
                ref={isTail ? crumbTailRef : undefined}
                className={styles.crumbItem}
              >
                {i > 0 ? (
                  <span className={styles.chevron} aria-hidden="true">
                    ›
                  </span>
                ) : null}
                <span
                  className={[
                    styles.chip,
                    chip.kind === "player"
                      ? styles.chipPlayer
                      : chip.kind === "national_team"
                        ? styles.chipNational
                        : styles.chipClub,
                    chip.active ? styles.chipActive : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <KindMark kind={chip.kind} />
                  <span className={styles.chipBody}>
                    <span className={styles.chipName}>{chip.label}</span>
                    {chip.kind === "national_team" ? (
                      <span className={styles.chipMeta}>{NT_ANY_ERA_LABEL}</span>
                    ) : null}
                    {chip.years ? (
                      <span className={styles.chipYears}>{chip.years}</span>
                    ) : null}
                  </span>
                </span>
              </div>
            );
          })}
        </nav>
        {crumbOverflow ? (
          <div className={styles.breadcrumbFade} aria-hidden="true" />
        ) : null}
      </div>

      <div className={styles.optionsRegion}>
        {won ? (
          <p className={styles.emptyHint}>Circuit closed.</p>
        ) : options.length === 0 ? (
          <p className={styles.emptyHint}>
            {chips.length <= 1
              ? "Their clubs and national teams will appear here."
              : "Pick an option above to continue."}
          </p>
        ) : (
          <>
            {showSearch ? (
              <div className={styles.searchBar}>
                <input
                  ref={searchRef}
                  type="search"
                  className={styles.searchInput}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter by name…"
                  aria-label="Filter options by name"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
                {query.trim() ? (
                  <span className={styles.searchCount} aria-live="polite">
                    {filtered.length} / {options.length}
                  </span>
                ) : null}
              </div>
            ) : null}

            {filtered.length === 0 ? (
              <p className={styles.emptyHint}>No names match “{query.trim()}”.</p>
            ) : (
              <div
                className={styles.optionsScroll}
                role="list"
                aria-label="Available connections"
              >
                <div className={styles.optionsGrid} key={optionsKey}>
                  {filtered.map((opt, i) => (
                    <button
                      key={opt.id}
                      type="button"
                      role="listitem"
                      className={[
                        styles.optionCard,
                        opt.kind === "national_team"
                          ? styles.optionNational
                          : "",
                        opt.kind === "club" ? styles.optionClub : "",
                        opt.kind === "player" ? styles.optionPlayer : "",
                        opt.isDeadEnd ? styles.optionDead : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={
                        {
                          /* Cap matches --stagger-cap so huge grids stay snappy */
                          "--stagger-i": Math.min(i, 8),
                        } as CSSProperties
                      }
                      disabled={opt.isDeadEnd}
                      aria-disabled={opt.isDeadEnd}
                      aria-label={`${opt.label}${opt.kind === "national_team" ? ` (national team, ${NT_ANY_ERA_LABEL})` : opt.kind === "club" ? " (club)" : ""}${opt.isDeadEnd ? " — dead end" : ""}`}
                      onClick={() => {
                        if (!opt.isDeadEnd) select(opt.id);
                      }}
                    >
                      <KindMark kind={opt.kind} />
                      <div className={styles.optionText}>
                        <TruncatingName
                          name={opt.label}
                          className={styles.optionName}
                        />
                        {opt.kind === "national_team" ? (
                          <span className={styles.optionKind}>
                            {NT_ANY_ERA_LABEL}
                          </span>
                        ) : null}
                        {opt.sublabel ? (
                          <span
                            className={
                              opt.kind === "club"
                                ? styles.optionYears
                                : styles.optionSub
                            }
                          >
                            {opt.sublabel}
                          </span>
                        ) : null}
                        {opt.isDeadEnd ? (
                          <span className={styles.deadTag}>dead end</span>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
