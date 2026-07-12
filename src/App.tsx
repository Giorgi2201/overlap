import { useEffect, useReducer } from "react";
import { GameScreen } from "./components/GameScreen";
import { StartScreen } from "./components/StartScreen";
import { loadGraph } from "./lib/graph";
import { generateRandomPair } from "./lib/pathfinding";
import {
  gameReducer,
  hydrateGameState,
  persistGameSession,
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
