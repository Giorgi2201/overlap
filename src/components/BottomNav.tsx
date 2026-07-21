import type { ReactNode } from "react";
import { useState } from "react";
import styles from "./BottomNav.module.css";

export interface BottomNavItem {
  id: string;
  /** Visible label under the icon (also the accessible name). */
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Optional numeric badge shown on the icon (e.g. undosRemaining). */
  badge?: number | null;
}

interface BottomNavProps {
  items: BottomNavItem[];
  /** Accessible name for the landmark. */
  ariaLabel?: string;
}

/** Session-scoped: pill entrance plays once per page load, not on remounts. */
let pillEntranceConsumed = false;

/** Thin-stroke home / house glyph. */
export function HomeIcon() {
  return (
    <svg
      className={styles.svg}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4.5 11.25 12 4.75l7.5 6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.25 10.5V18.5a1 1 0 0 0 1 1h2.75v-4.25h2v4.25H15.75a1 1 0 0 0 1-1v-8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Thin-stroke counter-clockwise undo arrow. */
export function UndoIcon() {
  return (
    <svg
      className={styles.svg}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9.5 7.5 6 11l3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 11h7.25a4.75 4.75 0 1 1 0 9.5H11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Thin-stroke exit / door glyph for giving up. */
export function GiveUpIcon() {
  return (
    <svg
      className={styles.svg}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M10 5.5H7.5A2.5 2.5 0 0 0 5 8v8a2.5 2.5 0 0 0 2.5 2.5H10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11 12h8.5m0 0-2.75-2.75M19.5 12l-2.75 2.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Floating pill bottom nav — icon + label row, outside the game panel.
 * Footprint vars (--bottom-nav-total) reserve clearance in GameScreen.
 */
export function BottomNav({
  items,
  ariaLabel = "Game actions",
}: BottomNavProps) {
  const [playEntrance] = useState(() => {
    if (pillEntranceConsumed) return false;
    pillEntranceConsumed = true;
    return true;
  });

  return (
    <div className={styles.dock}>
      <nav
        className={[styles.pill, playEntrance ? styles.pillEnter : ""]
          .filter(Boolean)
          .join(" ")}
        aria-label={ariaLabel}
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={styles.item}
            onClick={item.onClick}
            disabled={item.disabled}
          >
            <span className={styles.icon} aria-hidden="true">
              {item.icon}
              {item.badge != null ? (
                <span
                  className={[
                    styles.badge,
                    item.badge <= 0 ? styles.badgeEmpty : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-hidden="true"
                >
                  {item.badge}
                </span>
              ) : null}
            </span>
            <span className={styles.label}>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
