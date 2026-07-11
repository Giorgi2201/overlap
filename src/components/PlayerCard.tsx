import { useTilt } from "../hooks/useTilt";
import styles from "./PlayerCard.module.css";

interface PlayerCardProps {
  name: string;
  position?: string;
  /** Current club name — shown in full (wraps; tooltip for outliers). */
  club?: string;
  /** National team name when known — shown in full. */
  nationalTeam?: string;
  role: "start" | "target";
  active?: boolean;
  won?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  /** Tighter card for the fixed-viewport game board. */
  compact?: boolean;
}

/** Tooltip for genuine long outliers; short names stay clean. */
function EntityLine({
  name,
  kind,
}: {
  name: string;
  kind: "club" | "national_team";
}) {
  const needsTip = name.length > 36;
  return (
    <span
      className={kind === "national_team" ? styles.nationalTeam : styles.club}
      title={needsTip ? name : undefined}
    >
      {name}
    </span>
  );
}

export function PlayerCard({
  name,
  position,
  club,
  nationalTeam,
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
        aria-label={`${role === "start" ? "Start" : "Target"}: ${name}${club ? `, ${club}` : ""}${nationalTeam ? `, ${nationalTeam}` : ""}`}
      >
        <span className={styles.role}>
          {role === "start" ? "Start" : "Target"}
        </span>
        <span className={styles.name} title={name}>
          {name}
        </span>
        {position ? <span className={styles.meta}>{position}</span> : null}
        {club ? <EntityLine name={club} kind="club" /> : null}
        {nationalTeam ? (
          <EntityLine name={nationalTeam} kind="national_team" />
        ) : null}
        <span
          className={[styles.hint, interactive ? "" : styles.hintHidden]
            .filter(Boolean)
            .join(" ")}
          aria-hidden={!interactive}
        >
          Tap to open
        </span>
      </button>
    </div>
  );
}
