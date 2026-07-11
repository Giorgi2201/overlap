import { useEffect, useRef, useState } from "react";
import styles from "./StartScreen.module.css";

interface StartScreenProps {
  level: number;
  onStart: () => void;
  onResetProgress: () => void;
}

export function StartScreen({ level, onStart, onResetProgress }: StartScreenProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || reduceMotion) return;
    // iOS / Safari: muted + playsInline required; play() can still reject.
    video.muted = true;
    const attempt = video.play();
    if (attempt && typeof attempt.catch === "function") {
      attempt.catch(() => {
        // Autoplay blocked — leave paused; void scrim still covers the screen.
      });
    }
  }, [reduceMotion]);

  return (
    <main className={styles.screen}>
      <div className={styles.media} aria-hidden="true">
        {!reduceMotion ? (
          <video
            ref={videoRef}
            className={styles.video}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          >
            {/*
              Drop /public/hero-bg.webm and add
              <source src="/hero-bg.webm" type="video/webm" /> above the MP4
              when a WebM encode is available. Shipping MP4-only for now so
              we don't 404 the preferred format on every visit.
            */}
            <source src="/hero-bg.mp4" type="video/mp4" />
          </video>
        ) : null}
        <div className={styles.scrim} />
      </div>

      <div className={styles.content}>
        <p className={styles.eyebrow}>Football · shared clubs & nations</p>
        <h1 className={styles.brand}>Overlap</h1>
        <p className={styles.levelPill}>
          <span className={styles.levelKey}>Level</span>
          <span className={styles.levelVal}>{level}</span>
        </p>
        <p className={styles.lede}>
          Two players. Build a chain through clubs or national teams they
          actually represented — not just names on a Wikipedia list.
        </p>
        <p className={styles.detail}>
          Pick an entity, then a teammate who shared it. Keep going until you
          reach the target. Dead ends are marked so you never walk into a wall
          blind.
        </p>
        <button type="button" className={styles.cta} onClick={onStart}>
          New puzzle
        </button>

        <div className={styles.resetZone}>
          {confirmReset ? (
            <div className={styles.resetConfirm} role="group" aria-label="Confirm reset">
              <p className={styles.resetPrompt}>Reset level back to 1?</p>
              <div className={styles.resetActions}>
                <button
                  type="button"
                  className={styles.resetCancel}
                  onClick={() => setConfirmReset(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.resetDanger}
                  onClick={() => {
                    setConfirmReset(false);
                    onResetProgress();
                  }}
                >
                  Reset
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={styles.resetProgress}
              onClick={() => setConfirmReset(true)}
            >
              Reset progress
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
