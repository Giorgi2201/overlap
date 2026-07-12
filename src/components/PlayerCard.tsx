import { useState } from "react";
import { useTilt } from "../hooks/useTilt";
import styles from "./PlayerCard.module.css";

interface PlayerCardProps {
  name: string;
  position?: string;
  /** Current club name — shown in full (wraps; tooltip for outliers). */
  club?: string;
  /** Mono year range for the listed club, e.g. "2018–2021" / "2023–present". */
  clubYears?: string | null;
  /** National team name when known — shown in full. */
  nationalTeam?: string;
  /** Transfermarkt portrait URL; reserved image slot always renders. */
  imageUrl?: string | null;
  role: "start" | "target";
  active?: boolean;
  won?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  /** Tighter card for the fixed-viewport game board. */
  compact?: boolean;
}

/** Initials for the reserved photo placeholder when no usable image. */
export function playerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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

/**
 * Always occupies the national-team row so start/target cards stay the same
 * height whether or not the player has an NT affiliation in our data.
 */
function NationalTeamSlot({ name }: { name?: string }) {
  if (name) {
    return <EntityLine name={name} kind="national_team" />;
  }
  return (
    <span className={styles.nationalTeamEmpty} aria-hidden="true">
      &nbsp;
    </span>
  );
}

function PhotoSlot({
  name,
  imageUrl,
  role,
}: {
  name: string;
  imageUrl?: string | null;
  role: "start" | "target";
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(imageUrl) && !failed;

  return (
    <div className={styles.photo}>
      <div
        className={[
          styles.photoFrame,
          role === "target" ? styles.photoFrameTarget : styles.photoFrameStart,
        ].join(" ")}
        aria-hidden={showImage ? undefined : true}
      >
        {showImage ? (
          <img
            className={styles.photoImg}
            src={imageUrl!}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />
        ) : (
          <span className={styles.photoInitials}>{playerInitials(name)}</span>
        )}
      </div>
    </div>
  );
}

export function PlayerCard({
  name,
  position,
  club,
  clubYears,
  nationalTeam,
  imageUrl,
  role,
  active = false,
  won = false,
  onClick,
  disabled = false,
  compact = false,
}: PlayerCardProps) {
  const tilt = useTilt(compact ? 3 : 6);
  const interactive = Boolean(onClick) && !disabled;
  const yearsLabel = clubYears?.trim() || null;

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
        aria-label={`${role === "start" ? "Start" : "Target"}: ${name}${club ? `, ${club}` : ""}${yearsLabel ? ` (${yearsLabel})` : ""}${nationalTeam ? `, ${nationalTeam}` : ""}`}
      >
        <PhotoSlot name={name} imageUrl={imageUrl} role={role} />
        <span className={styles.body}>
          <span className={styles.role}>
            {role === "start" ? "Start" : "Target"}
          </span>
          <span className={styles.name} title={name}>
            {name}
          </span>
          {position ? <span className={styles.meta}>{position}</span> : null}
          {club ? (
            <span className={styles.clubBlock}>
              <EntityLine name={club} kind="club" />
              {yearsLabel ? (
                <span className={styles.clubYears}>{yearsLabel}</span>
              ) : null}
            </span>
          ) : null}
          <NationalTeamSlot name={nationalTeam} />
          <span
            className={[styles.hint, interactive ? "" : styles.hintHidden]
              .filter(Boolean)
              .join(" ")}
            aria-hidden={!interactive}
          >
            Tap to open
          </span>
        </span>
      </button>
    </div>
  );
}
