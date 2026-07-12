import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type TransitionEvent,
} from "react";
import type { AffiliationGraph } from "../lib/graph";
import { getEntityOptions, getTeammateOptions } from "../lib/deadEnds";
import { formatAffiliationYears } from "../lib/overlap";
import { buildWinPathReveal } from "../lib/winPath";
import type { GameAction, GameState } from "../state/gameState";
import { currentPlayerId } from "../state/gameState";
import {
  ConnectionPanel,
  PathChipRow,
  type BreadcrumbChip,
  type OptionCard,
} from "./ConnectionPanel";
import {
  BottomNav,
  GiveUpIcon,
  HomeIcon,
  UndoIcon,
} from "./BottomNav";
import { PlayerCard } from "./PlayerCard";
import styles from "./GameScreen.module.css";

interface GameScreenProps {
  graph: AffiliationGraph;
  state: GameState;
  dispatch: Dispatch<GameAction>;
  onNextLevel: () => void;
  onBackToMenu: () => void;
  onResetProgress: () => void;
}

function chipKind(
  graph: AffiliationGraph,
  type: "player" | "entity",
  id: string,
): BreadcrumbChip["kind"] {
  if (type === "player") return "player";
  return graph.entities.get(id)?.type === "national_team"
    ? "national_team"
    : "club";
}

export function GameScreen({
  graph,
  state,
  dispatch,
  onNextLevel,
  onBackToMenu,
  onResetProgress,
}: GameScreenProps) {
  /** Modal stays mounted through exit so fade/slide can finish. */
  const [giveUpMounted, setGiveUpMounted] = useState(false);
  const [giveUpOpen, setGiveUpOpen] = useState(false);
  const resetAfterCloseRef = useRef(false);

  const openGiveUp = () => {
    resetAfterCloseRef.current = false;
    setGiveUpMounted(true);
  };

  const closeGiveUp = (opts?: { reset?: boolean }) => {
    if (opts?.reset) resetAfterCloseRef.current = true;
    setGiveUpOpen(false);
  };

  // Enter: mount → paint closed → open (so CSS transitions run).
  useEffect(() => {
    if (!giveUpMounted) return;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setGiveUpOpen(true));
    });
    return () => cancelAnimationFrame(id);
  }, [giveUpMounted]);

  useEffect(() => {
    if (!giveUpMounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeGiveUp();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [giveUpMounted]);

  const onGiveUpTransitionEnd = (e: TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (giveUpOpen) return;
    setGiveUpMounted(false);
    if (resetAfterCloseRef.current) {
      resetAfterCloseRef.current = false;
      onResetProgress();
    }
  };

  const startPlayer = graph.players.get(state.startPlayerId!);
  const targetPlayer = graph.players.get(state.targetPlayerId!);
  const startClub = graph.getCurrentClub(state.startPlayerId!);
  const targetClub = graph.getCurrentClub(state.targetPlayerId!);
  const targetClubAff = graph.getCurrentClubAffiliation(state.targetPlayerId!);
  const targetClubYears = targetClubAff
    ? formatAffiliationYears(targetClubAff)
    : null;
  const startNationalTeam = graph
    .getEntitiesForPlayer(state.startPlayerId!)
    .find((e) => e.type === "national_team");
  const targetNationalTeam = graph
    .getEntitiesForPlayer(state.targetPlayerId!)
    .find((e) => e.type === "national_team");
  const chainTailId = currentPlayerId(state.chain);
  const hopCount = state.chain.filter((n) => n.type === "entity").length;
  const won = state.phase === "won";
  const puzzleKey = `${state.level}-${state.startPlayerId}-${state.targetPlayerId}`;

  const winReveal = useMemo(() => {
    if (!won || !state.startPlayerId || !state.targetPlayerId) return null;
    return buildWinPathReveal(
      graph,
      state.startPlayerId,
      state.targetPlayerId,
      state.chain,
    );
  }, [won, graph, state.startPlayerId, state.targetPlayerId, state.chain]);

  const chips: BreadcrumbChip[] = useMemo(() => {
    return state.chain.map((node, i) => {
      const kind = chipKind(graph, node.type, node.id);
      const label =
        node.type === "player"
          ? (graph.players.get(node.id)?.name ?? node.id)
          : (graph.entities.get(node.id)?.name ?? node.id);
      let years: string | null = null;
      if (node.type === "entity" && kind === "club") {
        const prev = state.chain[i - 1];
        if (prev?.type === "player") {
          const aff = graph
            .getAffiliationsForPlayer(prev.id)
            .find((a) => a.entityId === node.id);
          years = aff ? formatAffiliationYears(aff) : null;
        }
      }
      return {
        key: `${node.type}-${node.id}-${i}`,
        label,
        kind,
        years,
        active: i === state.chain.length - 1 && !won,
      };
    });
  }, [graph, state.chain, won]);

  const optionsKey = useMemo(() => {
    if (!state.expanded) return "none";
    if (state.expanded.kind === "entities") {
      return `entities:${state.expanded.playerId}`;
    }
    return `teammates:${state.expanded.viaPlayerId}:${state.expanded.entityId}`;
  }, [state.expanded]);

  const options: OptionCard[] = useMemo(() => {
    if (won || !state.expanded || !state.targetPlayerId) return [];
    if (state.expanded.kind === "entities") {
      const playerId = state.expanded.playerId;
      return getEntityOptions(
        graph,
        playerId,
        state.targetPlayerId,
        state.chain,
      ).map(({ entity, isDeadEnd }) => {
        const aff = graph
          .getAffiliationsForPlayer(playerId)
          .find((a) => a.entityId === entity.id);
        const years =
          entity.type === "club" && aff ? formatAffiliationYears(aff) : null;
        return {
          id: entity.id,
          label: entity.name,
          sublabel: years ?? undefined,
          kind:
            entity.type === "national_team"
              ? ("national_team" as const)
              : ("club" as const),
          isDeadEnd,
        };
      });
    }
    return getTeammateOptions(
      graph,
      state.expanded.viaPlayerId,
      state.expanded.entityId,
      state.targetPlayerId,
      state.chain,
    ).map(({ player, isDeadEnd }) => ({
      id: player.id,
      label: player.name,
      sublabel: player.position,
      kind: "player" as const,
      isDeadEnd,
    }));
  }, [graph, state.expanded, state.targetPlayerId, state.chain, won]);

  const onSelectOption = (id: string) => {
    if (!state.expanded) return;
    if (state.expanded.kind === "entities") {
      dispatch({ type: "SELECT_ENTITY", entityId: id });
    } else {
      dispatch({ type: "SELECT_PLAYER", playerId: id });
    }
  };

  const prompt = won
    ? ""
    : state.expanded === null
      ? "Open the start player to begin the circuit."
      : state.expanded.kind === "entities"
        ? "Choose a club or national team."
        : "Choose a teammate who shared that entity.";

  return (
    <>
      <main
        className={[styles.screen, won ? "" : styles.screenWithNav]
          .filter(Boolean)
          .join(" ")}
      >
        <header className={styles.topbar}>
          <span className={styles.brand}>Overlap</span>
          <div className={styles.hud} aria-live="polite">
            <span className={styles.levelPill}>
              <span className={styles.levelKey}>Level</span>
              <span className={styles.levelVal}>{state.level}</span>
            </span>
            <span className={styles.hops}>
              {hopCount} {hopCount === 1 ? "hop" : "hops"}
            </span>
          </div>
        </header>

        <section className={styles.board}>
          <div
            key={`start-${puzzleKey}`}
            className={`${styles.cardSlot} ${styles.startSlot} ${styles.cardEnterStart}`}
          >
            <PlayerCard
              compact
              name={startPlayer?.name ?? "—"}
              position={startPlayer?.position}
              club={startClub?.name}
              nationalTeam={startNationalTeam?.name}
              imageUrl={startPlayer?.imageUrl}
              role="start"
              active={chainTailId === startPlayer?.id && !won}
              disabled={won || chainTailId !== startPlayer?.id}
              onClick={() =>
                dispatch({ type: "EXPAND_PLAYER", playerId: startPlayer!.id })
              }
            />
          </div>

          <div className={styles.panelSlot}>
            <ConnectionPanel
              chips={chips}
              options={options}
              optionsKey={optionsKey}
              prompt={prompt}
              won={won}
              onSelectOption={onSelectOption}
            />
          </div>

          <div
            key={`target-${puzzleKey}`}
            className={`${styles.cardSlot} ${styles.targetSlot} ${styles.cardEnterTarget}`}
          >
            <PlayerCard
              compact
              name={targetPlayer?.name ?? "—"}
              position={targetPlayer?.position}
              club={targetClub?.name}
              clubYears={targetClubYears}
              nationalTeam={targetNationalTeam?.name}
              imageUrl={targetPlayer?.imageUrl}
              role="target"
              won={won}
            />
          </div>
        </section>

        {won ? (
          <section className={styles.win} aria-live="polite">
            <h2 className={styles.winTitle}>Circuit closed</h2>
            <p className={styles.winCopy}>
              {startPlayer?.name} → {targetPlayer?.name}
            </p>
            <p className={`mono ${styles.winStat}`}>
              solved in {hopCount} {hopCount === 1 ? "hop" : "hops"} · level{" "}
              {state.level}
            </p>
            {winReveal?.kind === "shorter_exists" ? (
              <div className={styles.shortestReveal}>
                <p className={`mono ${styles.shortestLabel}`}>
                  Shortest path: {winReveal.shortestHops}{" "}
                  {winReveal.shortestHops === 1 ? "hop" : "hops"}
                </p>
                <div className={styles.shortestChips}>
                  <PathChipRow
                    chips={winReveal.chips}
                    ariaLabel="Shortest path"
                  />
                </div>
              </div>
            ) : null}
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={onNextLevel}
            >
              Next level
            </button>
            <button
              type="button"
              className={styles.menuLink}
              onClick={onBackToMenu}
            >
              Back to menu
            </button>
          </section>
        ) : null}

        {giveUpMounted ? (
          <div
            className={[
              styles.modalBackdrop,
              giveUpOpen ? styles.modalBackdropOpen : "",
            ]
              .filter(Boolean)
              .join(" ")}
            role="presentation"
            onClick={() => closeGiveUp()}
            onTransitionEnd={onGiveUpTransitionEnd}
          >
            <div
              className={[styles.modal, giveUpOpen ? styles.modalOpen : ""]
                .filter(Boolean)
                .join(" ")}
              role="dialog"
              aria-modal="true"
              aria-labelledby="give-up-title"
              onClick={(e) => e.stopPropagation()}
            >
              <p id="give-up-title" className={styles.modalPrompt}>
                Reset level back to 1?
              </p>
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.modalCancel}
                  onClick={() => closeGiveUp()}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.modalDanger}
                  onClick={() => closeGiveUp({ reset: true })}
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>

      {!won ? (
        <BottomNav
          items={[
            {
              id: "home",
              label: "Home",
              icon: <HomeIcon />,
              onClick: onBackToMenu,
            },
            {
              id: "undo",
              label: "Undo",
              icon: <UndoIcon />,
              disabled: state.chain.length <= 1,
              onClick: () => dispatch({ type: "UNDO" }),
            },
            {
              id: "give-up",
              label: "Give up",
              icon: <GiveUpIcon />,
              onClick: openGiveUp,
            },
          ]}
        />
      ) : null}
    </>
  );
}
