import { useState } from "react";
import { useTilt } from "../hooks/useTilt";
import styles from "./PlayerCard.module.css";

interface PlayerCardProps {
  name: string;
  position?: string;
  /** Current club name shown under the player. */
  club?: string;
  /** Transfermarkt portrait URL — optional; falls back to initials. */
  imageUrl?: string | null;
  role: "start" | "target";
  active?: boolean;
  won?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  /** Tighter card for the fixed-viewport game board. */
  compact?: boolean;
}

/** Up to two initials from a display name (fallback avatar). */
export function playerInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Avatar({
  name,
  imageUrl,
  role,
}: {
  name: string;
  imageUrl?: string | null;
  role: "start" | "target";
}) {
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(imageUrl) && !failed;
  const initials = playerInitials(name);

  return (
    <span
      className={[
        styles.avatar,
        role === "target" ? styles.avatarTarget : styles.avatarStart,
      ].join(" ")}
      aria-hidden="true"
    >
      {showImg ? (
        <img
          className={styles.avatarImg}
          src={imageUrl!}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={styles.avatarInitials}>{initials}</span>
      )}
    </span>
  );
}

export function PlayerCard({
  name,
  position,
  club,
  imageUrl,
  role,
  active = false,
  won = false,
  onClick,
  disabled = false,
  compact = false,
}: PlayerCardProps) {
  const tilt = useTilt(compact ? 4 : 7);
  const interactive = Boolean(onClick) && !disabled;

  return (
    <div
      ref={tilt.ref}
      className={[
        styles.card,
        compact ? styles.compact : "",
        role === "target" ? styles.target : styles.start,
        active ? styles.active : "",
        won ? styles.won : "",
        interactive ? styles.interactive : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={tilt.style}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
    >
      <button
        type="button"
        className={styles.hit}
        onClick={onClick}
        disabled={!interactive}
        aria-label={`${role === "start" ? "Start" : "Target"}: ${name}${club ? `, ${club}` : ""}`}
      >
        <span className={styles.top}>
          <Avatar name={name} imageUrl={imageUrl} role={role} />
          <span className={styles.copy}>
            <span className={styles.role}>
              {role === "start" ? "Start" : "Target"}
            </span>
            <span className={styles.name} title={name}>
              {name}
            </span>
            {position ? <span className={styles.meta}>{position}</span> : null}
            {club ? (
              <span className={styles.club} title={club}>
                {club}
              </span>
            ) : null}
            {interactive ? (
              <span className={styles.hint}>Tap to open</span>
            ) : null}
          </span>
        </span>
      </button>
    </div>
  );
}
