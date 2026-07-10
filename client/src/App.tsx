import { useReducer } from "react";
import { GameScreen } from "./components/GameScreen";
import { StartScreen } from "./components/StartScreen";
import { loadGraph } from "./lib/graph";
import { generateRandomPair } from "./lib/pathfinding";
import { gameReducer, initialGameState } from "./state/gameState";

const graph = loadGraph();

function App() {
  const [state, dispatch] = useReducer(gameReducer, initialGameState);

  if (state.phase === "start") {
    return (
      <StartScreen
        onStart={() =>
          dispatch({ type: "START_GAME", pair: generateRandomPair(graph) })
        }
      />
    );
  }
  return <GameScreen graph={graph} state={state} dispatch={dispatch} />;
}

export default App;
