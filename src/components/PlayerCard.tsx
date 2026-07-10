import { useTilt } from "../hooks/useTilt";
import styles from "./PlayerCard.module.css";

interface PlayerCardProps {
  name: string;
  position?: string;
  /** Current club name shown under the player. */
  club?: string;
  role: "start" | "target";
  active?: boolean;
  won?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

export function PlayerCard({
  name,
  position,
  club,
  role,
  active = false,
  won = false,
  onClick,
  disabled = false,
}: PlayerCardProps) {
  const tilt = useTilt(7);
  const interactive = Boolean(onClick) && !disabled;

  return (
    <div
      ref={tilt.ref}
      className={[
        styles.card,
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
        <span className={styles.role}>{role === "start" ? "Start" : "Target"}</span>
        <span className={styles.name}>{name}</span>
        {position ? <span className={styles.meta}>{position}</span> : null}
        {club ? (
          <span className={styles.club} title={club}>
            {club}
          </span>
        ) : null}
        {interactive ? (
          <span className={styles.hint}>Tap to open affiliations</span>
        ) : null}
      </button>
    </div>
  );
}
