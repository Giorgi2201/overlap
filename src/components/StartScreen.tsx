import { useEffect, useRef, useState } from "react";
import styles from "./StartScreen.module.css";

interface StartScreenProps {
  level: number;
  onStart: () => void;
  onResetProgress: () => void;
}

/**
 * Aligns with GameScreen's primary mobile layout breakpoint (board collapses
 * start/target onto one row at 860px).
 */
export const HERO_MOBILE_MAX_WIDTH_PX = 860;

export const HERO_BG_DESKTOP = "/hero-bg.mp4";
export const HERO_BG_MOBILE = "/hero-bg-mobile.mp4";

export function heroBgSrcForViewport(isMobile: boolean): string {
  return isMobile ? HERO_BG_MOBILE : HERO_BG_DESKTOP;
}

function readIsMobileViewport(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(`(max-width: ${HERO_MOBILE_MAX_WIDTH_PX}px)`).matches;
}

export function StartScreen({ level, onStart, onResetProgress }: StartScreenProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  // Resolve on first client render so we never mount the wrong <video> (and
  // therefore never kick off a download for the unused file).
  const [isMobile, setIsMobile] = useState(readIsMobileViewport);
  const videoRef = useRef<HTMLVideoElement>(null);
  const heroSrc = heroBgSrcForViewport(isMobile);

  useEffect(() => {
    const motionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const widthMq = window.matchMedia(
      `(max-width: ${HERO_MOBILE_MAX_WIDTH_PX}px)`,
    );
    const syncMotion = () => setReduceMotion(motionMq.matches);
    const syncWidth = () => setIsMobile(widthMq.matches);
    syncMotion();
    syncWidth();
    motionMq.addEventListener("change", syncMotion);
    widthMq.addEventListener("change", syncWidth);
    return () => {
      motionMq.removeEventListener("change", syncMotion);
      widthMq.removeEventListener("change", syncWidth);
    };
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
  }, [reduceMotion, heroSrc]);

  return (
    <main className={styles.screen}>
      <div className={styles.media} aria-hidden="true">
        {!reduceMotion ? (
          /*
            JS-selected single <video>, not <source media>.
            Video <source media> is unreliable across browsers and can still
            fetch both files — we only ever mount one src per viewport.
          */
          <video
            key={heroSrc}
            ref={videoRef}
            className={styles.video}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            src={heroSrc}
          />
        ) : null}
        <div className={styles.scrim} />
      </div>

      <div className={styles.content}>
        <p className={styles.eyebrow}>Football · timed clubs · any-era nations</p>
        <h1 className={styles.brand}>Overlap</h1>
        <p className={styles.levelPill}>
          <span className={styles.levelKey}>Level</span>
          <span className={styles.levelVal}>{level}</span>
        </p>
        <p className={styles.lede}>
          Connect two footballers through people who were genuinely teammates —
          same club, same window of time.
        </p>
        <p className={styles.detail}>
          Club links only count when their tenures overlap. National teams are
          looser: any shared side works, era optional. Dead ends stay marked so
          you never walk into a wall blind.
        </p>
        <button type="button" className={styles.cta} onClick={onStart}>
          {level > 1 ? "Continue" : "New puzzle"}
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
