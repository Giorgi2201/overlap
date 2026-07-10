import styles from "./StartScreen.module.css";

interface StartScreenProps {
  onStart: () => void;
}

export function StartScreen({ onStart }: StartScreenProps) {
  return (
    <main className={styles.screen}>
      <div className={styles.ambient} aria-hidden="true">
        <AmbientCircuit />
      </div>

      <div className={styles.content}>
        <p className={styles.eyebrow}>Football · shared clubs · real dates</p>
        <h1 className={styles.brand}>Overlap</h1>
        <p className={styles.lede}>
          Two players. Build a chain of teammates who were actually at the same
          club at the same time — not just names on a Wikipedia list.
        </p>
        <p className={styles.detail}>
          Pick a club, then a teammate who overlapped there for at least 30 days.
          Keep going until you reach the target. Dead ends are marked so you
          never walk into a wall blind.
        </p>
        <button type="button" className={styles.cta} onClick={onStart}>
          New puzzle
        </button>
      </div>
    </main>
  );
}

/** Soft looping preview of nodes completing a circuit — decorative only. */
function AmbientCircuit() {
  return (
    <svg className={styles.ambientSvg} viewBox="0 0 800 420" fill="none">
      <defs>
        <linearGradient id="amb-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--signal)" stopOpacity="0.15" />
          <stop offset="50%" stopColor="var(--signal)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--beacon)" stopOpacity="0.55" />
        </linearGradient>
        <filter id="amb-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        className={styles.ambPath}
        d="M120 210 C 220 120, 320 300, 400 210 C 480 120, 580 300, 680 210"
        stroke="url(#amb-grad)"
        strokeWidth="2"
        filter="url(#amb-glow)"
        pathLength={1}
      />
      <g className={styles.ambN2}>
        <circle className={styles.ambNode} cx="280" cy="165" r="12" />
      </g>
      <g className={styles.ambN3}>
        <circle className={styles.ambNode} cx="400" cy="210" r="16" />
      </g>
      <g className={styles.ambN4}>
        <circle className={styles.ambNode} cx="520" cy="255" r="12" />
      </g>
      <circle className={`${styles.ambNode} ${styles.ambEndpoint}`} cx="120" cy="210" r="18" />
      <circle className={`${styles.ambNode} ${styles.ambEndpoint}`} cx="680" cy="210" r="18" />
    </svg>
  );
}
