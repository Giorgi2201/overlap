import { AnimatePresence, motion } from "framer-motion";
import { type Dispatch } from "react";
import type { AffiliationGraph } from "../lib/graph";
import { getEntityOptions, getTeammateOptions } from "../lib/deadEnds";
import type { Entity } from "../lib/types";
import type { GameAction, GameState } from "../state/gameState";
import { PlayerProfile } from "./PlayerProfile";
import { RosterGrid } from "./RosterGrid";
import { Building2, Users, ArrowLeft } from "lucide-react";

interface WorkspaceProps {
  graph: AffiliationGraph;
  state: GameState;
  dispatch: Dispatch<GameAction>;
}

const slideVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

export function Workspace({ graph, state, dispatch }: WorkspaceProps) {
  const won = state.phase === "won";
  const expanded = state.expanded;

  const activePlayerId = expanded
    ? expanded.kind === "entities"
      ? expanded.playerId
      : expanded.viaPlayerId
    : state.startPlayerId;

  const activePlayer = activePlayerId ? graph.players.get(activePlayerId) : null;

  const entities: Entity[] = activePlayerId
    ? graph.getEntitiesForPlayer(activePlayerId)
    : [];

  const entityDeadEnds = new Map<string, boolean>();
  {
    const playerForDeadEnds =
      expanded?.kind === "entities"
        ? expanded.playerId
        : state.startPlayerId;
    if (playerForDeadEnds && state.targetPlayerId) {
      const opts = getEntityOptions(
        graph,
        playerForDeadEnds,
        state.targetPlayerId,
        state.chain,
      );
      for (const opt of opts) {
        entityDeadEnds.set(opt.entity.id, opt.isDeadEnd);
      }
    }
  }

  const teammates =
    expanded?.kind === "teammates"
      ? graph.getTeammates(expanded.viaPlayerId, expanded.entityId)
      : [];

  const teammateDeadEnds = new Map<string, boolean>();
  if (expanded?.kind === "teammates") {
    const opts = getTeammateOptions(
      graph,
      expanded.viaPlayerId,
      expanded.entityId,
      state.targetPlayerId!,
      state.chain,
    );
    for (const opt of opts) {
      teammateDeadEnds.set(opt.player.id, opt.isDeadEnd);
    }
  }

  const selectedEntity =
    expanded?.kind === "teammates"
      ? graph.entities.get(expanded.entityId)
      : null;

  const showPlayerCard = !expanded || expanded.kind === "entities";
  const showRosterList = expanded?.kind === "teammates";

  if (won) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4 text-center max-w-xs"
        >
          <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-400/30 flex items-center justify-center">
            <Building2 className="w-10 h-10 text-emerald-400" />
          </div>
          <h2 className="text-xl font-extrabold tracking-tight uppercase text-emerald-400">
            Circuit Complete
          </h2>
          <p className="text-sm text-slate-400">
            You successfully connected the chain. The path has been closed.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden px-4 sm:px-6 py-4 max-w-2xl mx-auto w-full">
      <AnimatePresence mode="wait">
        {showPlayerCard && activePlayer && (
          <motion.div
            key={`player-card-${activePlayer.id}`}
            variants={slideVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="flex-1 overflow-y-auto roster-scroll"
          >
            <PlayerProfile
              player={activePlayer}
              clubs={entities}
              onSelectClub={(entityId) =>
                dispatch({ type: "SELECT_ENTITY", entityId })
              }
              isDeadEndClub={(id) => entityDeadEnds.get(id) ?? false}
              isStart={activePlayer.id === state.startPlayerId}
              isTarget={activePlayer.id === state.targetPlayerId}
            />
          </motion.div>
        )}

        {showRosterList && expanded?.kind === "teammates" && (
          <motion.div
            key={`roster-${expanded.entityId}`}
            variants={slideVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="flex-1 flex flex-col min-h-0"
          >
            <div className="flex items-center gap-2 mb-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  dispatch({
                    type: "EXPAND_PLAYER",
                    playerId: expanded.viaPlayerId,
                  });
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors text-xs font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
              <div className="h-4 w-px bg-slate-700/50" />
              <div className="flex items-center gap-2 min-w-0">
                <Users className="w-4 h-4 text-slate-500 shrink-0" />
                <p className="text-sm font-semibold text-slate-200 truncate">
                  {selectedEntity?.name ?? "Team"}
                </p>
              </div>
            </div>

            <RosterGrid
              players={teammates}
              clubName={selectedEntity?.name ?? ""}
              onSelect={(playerId) =>
                dispatch({ type: "SELECT_PLAYER", playerId })
              }
              isDeadEnd={(id) => teammateDeadEnds.get(id) ?? false}
              targetPlayerId={state.targetPlayerId}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
