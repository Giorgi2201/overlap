import { useMemo, type Dispatch } from "react";
import type { AffiliationGraph } from "../lib/graph";
import { getEntityOptions, getTeammateOptions } from "../lib/deadEnds";
import { formatAffiliationYears } from "../lib/overlap";
import type { GameAction, GameState } from "../state/gameState";
import { currentPlayerId } from "../state/gameState";
import { ChainGraph, type SatelliteOption } from "./ChainGraph";
import { PlayerCard } from "./PlayerCard";
import styles from "./GameScreen.module.css";

interface GameScreenProps {
  graph: AffiliationGraph;
  state: GameState;
  dispatch: Dispatch<GameAction>;
}

export function GameScreen({ graph, state, dispatch }: GameScreenProps) {
  const startPlayer = graph.players.get(state.startPlayerId!);
  const targetPlayer = graph.players.get(state.targetPlayerId!);
  const startClub = graph.getCurrentClub(state.startPlayerId!);
  const targetClub = graph.getCurrentClub(state.targetPlayerId!);
  const chainTailId = currentPlayerId(state.chain);
  const hopCount = state.chain.filter((n) => n.type === "entity").length;
  const won = state.phase === "won";

  const satellites: SatelliteOption[] = useMemo(() => {
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
          entity.type === "club" && aff
            ? formatAffiliationYears(aff)
            : null;
        return {
          id: entity.id,
          label: entity.name,
          // Years are flavor metadata only — not a validity rule.
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

  const onSelectSatellite = (id: string) => {
    if (!state.expanded) return;
    if (state.expanded.kind === "entities") {
      dispatch({ type: "SELECT_ENTITY", entityId: id });
    } else {
      dispatch({ type: "SELECT_PLAYER", playerId: id });
    }
  };

  return (
    <main className={styles.screen}>
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
            solved in {hopCount} {hopCount === 1 ? "hop" : "hops"} · next level{" "}
            {state.level}
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
