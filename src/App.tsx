import { useReducer } from "react";
import { GameScreen } from "./components/GameScreen";
import { StartScreen } from "./components/StartScreen";
import { loadGraph } from "./lib/graph";
import { generateRandomPair } from "./lib/pathfinding";
import { createInitialState, gameReducer } from "./state/gameState";

const graph = loadGraph();

function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialState);

  if (state.phase === "start") {
    return (
      <StartScreen
        level={state.level}
        onStart={() =>
          dispatch({
            type: "START_GAME",
            pair: generateRandomPair(graph, { level: state.level }),
          })
        }
        onResetProgress={() => dispatch({ type: "RESET_PROGRESS" })}
      />
    );
  }
  return <GameScreen graph={graph} state={state} dispatch={dispatch} />;
}

export default App;
