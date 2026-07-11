import { useMemo, type Dispatch } from "react";
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
import { PlayerCard } from "./PlayerCard";
import styles from "./GameScreen.module.css";

interface GameScreenProps {
  graph: AffiliationGraph;
  state: GameState;
  dispatch: Dispatch<GameAction>;
  onNextLevel: () => void;
  onBackToMenu: () => void;
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
}: GameScreenProps) {
  const startPlayer = graph.players.get(state.startPlayerId!);
  const targetPlayer = graph.players.get(state.targetPlayerId!);
  const startClub = graph.getCurrentClub(state.startPlayerId!);
  const targetClub = graph.getCurrentClub(state.targetPlayerId!);
  const startNationalTeam = graph
    .getEntitiesForPlayer(state.startPlayerId!)
    .find((e) => e.type === "national_team");
  const targetNationalTeam = graph
    .getEntitiesForPlayer(state.targetPlayerId!)
    .find((e) => e.type === "national_team");
  const chainTailId = currentPlayerId(state.chain);
  const hopCount = state.chain.filter((n) => n.type === "entity").length;
  const won = state.phase === "won";

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
    ? "Circuit closed."
    : state.expanded === null
      ? "Open the start player to begin the circuit."
      : state.expanded.kind === "entities"
        ? "Choose a club or national team."
        : "Choose a teammate who shared that entity.";

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
        <div className={`${styles.cardSlot} ${styles.startSlot}`}>
          <PlayerCard
            compact
            name={startPlayer?.name ?? "—"}
            position={startPlayer?.position}
            club={startClub?.name}
            nationalTeam={startNationalTeam?.name}
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

        <div className={`${styles.cardSlot} ${styles.targetSlot}`}>
          <PlayerCard
            compact
            name={targetPlayer?.name ?? "—"}
            position={targetPlayer?.position}
            club={targetClub?.name}
            nationalTeam={targetNationalTeam?.name}
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
            {winReveal?.kind === "optimal" ? " · optimal path" : ""}
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
            onClick={onBackToMenu}
          >
            Give up
          </button>
        </footer>
      )}
    </main>
  );
}
