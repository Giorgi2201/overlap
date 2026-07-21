import { useEffect, useReducer } from "react";
import { GameScreen } from "./components/GameScreen";
import { StartScreen } from "./components/StartScreen";
import { loadGraph } from "./lib/graph";
import { generateRandomPair } from "./lib/pathfinding";
import {
  gameReducer,
  hydrateGameState,
  persistGameSession,
  readStoredSession,
  validatePlayingSession,
  type GameState,
} from "./state/gameState";

const graph = loadGraph();

function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, () =>
    hydrateGameState(graph, (level) => generateRandomPair(graph, { level })),
  );

  useEffect(() => {
    persistGameSession(state);
  }, [state]);

  const startPuzzleAtCurrentLevel = () => {
    // First check if there's a saved in-progress session to restore
    const stored = readStoredSession();
    if (stored?.kind === "playing") {
      const restored = validatePlayingSession(stored, graph);
      if (restored) {
        dispatch({ type: "RESTORE_SESSION", state: restored });
        return;
      }
    }
    if (stored?.kind === "advance") {
      // An advance marker means the user had won before navigating Home;
      // generate a new puzzle at the current level (same as "Next level").
      try {
        const pair = generateRandomPair(graph, { level: state.level });
        const advanceState: GameState = {
          phase: "playing",
          level: state.level,
          startPlayerId: pair.startPlayerId,
          targetPlayerId: pair.targetPlayerId,
          chain: [{ type: "player", id: pair.startPlayerId }],
          expanded: null,
          undosRemaining: stored.undosRemaining,
          shortestPathLength: pair.pathLength,
        };
        persistGameSession(advanceState);
        dispatch({ type: "RESTORE_SESSION", state: advanceState });
        return;
      } catch {
        // Fall through to the START_GAME fallback below
      }
    }
    // Nothing stored — generate a fresh puzzle
    dispatch({
      type: "START_GAME",
      pair: generateRandomPair(graph, { level: state.level }),
    });
  };

  if (state.phase === "start") {
    return (
      <StartScreen
        level={state.level}
        onStart={startPuzzleAtCurrentLevel}
        onResetProgress={() => dispatch({ type: "RESET_PROGRESS" })}
      />
    );
  }

  return (
    <GameScreen
      graph={graph}
      state={state}
      dispatch={dispatch}
      onNextLevel={startPuzzleAtCurrentLevel}
      onBackToMenu={() => dispatch({ type: "RESET" })}
      onResetProgress={() => dispatch({ type: "RESET_PROGRESS" })}
    />
  );
}

export default App;
