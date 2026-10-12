export { ADJACENT, COORDS, MILLS, MILLS_BY_POINT, POINT_COUNT } from './board';
export {
  NO_CAPTURE_LIMIT,
  REPETITION_LIMIT,
  applyMove,
  isInMill,
  legalMoves,
  newGame,
  phase,
  positionKey,
} from './game';
export type { Cell, GameResult, GameState, Move, Player } from './game';
