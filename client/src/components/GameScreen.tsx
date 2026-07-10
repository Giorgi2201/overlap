import { useMemo, type Dispatch } from "react";
import type { TenureGraph } from "../lib/graph";
import { getClubOptions, getTeammateOptions } from "../lib/deadEnds";
import type { GameAction, GameState } from "../state/gameState";
import { currentPlayerId } from "../state/gameState";
import { ChainGraph, type SatelliteOption } from "./ChainGraph";
import { PlayerCard } from "./PlayerCard";
import styles from "./GameScreen.module.css";

interface GameScreenProps {
  graph: TenureGraph;
  state: GameState;
  dispatch: Dispatch<GameAction>;
}

export function GameScreen({ graph, state, dispatch }: GameScreenProps) {
  const startPlayer = graph.players.get(state.startPlayerId!);
  const targetPlayer = graph.players.get(state.targetPlayerId!);
  const startClub = graph.getCurrentClub(state.startPlayerId!);
  const targetClub = graph.getCurrentClub(state.targetPlayerId!);
  const chainTailId = currentPlayerId(state.chain);
  const hopCount = state.chain.filter((n) => n.type === "club").length;
  const won = state.phase === "won";

  const satellites: SatelliteOption[] = useMemo(() => {
    if (won || !state.expanded || !state.targetPlayerId) return [];
    if (state.expanded.kind === "clubs") {
      return getClubOptions(
        graph,
        state.expanded.playerId,
        state.targetPlayerId,
        state.chain,
      ).map(({ club, isDeadEnd }) => ({
        id: club.id,
        label: club.name,
        sublabel: club.country,
        kind: "club" as const,
        isDeadEnd,
      }));
    }
    return getTeammateOptions(
      graph,
      state.expanded.viaPlayerId,
      state.expanded.clubId,
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

  const onSelectSatellite = (id: string) => {
    if (!state.expanded) return;
    if (state.expanded.kind === "clubs") {
      dispatch({ type: "SELECT_CLUB", clubId: id });
    } else {
      dispatch({ type: "SELECT_PLAYER", playerId: id });
    }
  };

  return (
    <main className={styles.screen}>
      <header className={styles.topbar}>
        <span className={styles.brand}>Overlap</span>
        <span className={`mono ${styles.hops}`} aria-live="polite">
          {hopCount} {hopCount === 1 ? "hop" : "hops"}
        </span>
      </header>

      <section className={styles.board}>
        <div className={styles.cardSlot}>
          <PlayerCard
            name={startPlayer?.name ?? "—"}
            position={startPlayer?.position}
            club={startClub?.name}
            role="start"
            active={chainTailId === startPlayer?.id && !won}
            disabled={won || chainTailId !== startPlayer?.id}
            onClick={() =>
              dispatch({ type: "EXPAND_PLAYER", playerId: startPlayer!.id })
            }
          />
        </div>

        <div className={styles.graphSlot}>
          <ChainGraph
            graph={graph}
            chain={state.chain}
            expanded={state.expanded}
            satellites={satellites}
            won={won}
            onSelectSatellite={onSelectSatellite}
          />
        </div>

        <div className={styles.cardSlot}>
          <PlayerCard
            name={targetPlayer?.name ?? "—"}
            position={targetPlayer?.position}
            club={targetClub?.name}
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
            solved in {hopCount} {hopCount === 1 ? "hop" : "hops"}
          </p>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => dispatch({ type: "RESET" })}
          >
            Play again
          </button>
        </section>
      ) : (
        <footer className={styles.actions}>
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={() => dispatch({ type: "UNDO" })}
            disabled={state.chain.length <= 1}
          >
            Undo
          </button>
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={() => dispatch({ type: "RESET" })}
          >
            Give up
          </button>
        </footer>
      )}
    </main>
  );
}
