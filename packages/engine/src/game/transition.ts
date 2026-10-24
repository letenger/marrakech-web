import { advanceTurn, applyPlacement, applyRotation, legalPlacements } from './moves';
import type { Placement, RotateChoice } from './moves';
import { countConnectedColour } from './board';
import { moveAssam, rollDie, settlePayment } from './rules';
import type { GameState } from './types';
import type { Rng } from './setup';
export type GameAction = {
  type: 'rotate';
  rotation: RotateChoice;
} | {
  type: 'roll';
} | {
  type: 'place';
  placement: Placement;
};
/** Validated authoritative transition. Invalid actions never advance a turn. */
export function transitionGame(state: GameState, action: GameAction, rng: Rng): {
  state: GameState;
  roll: number | null;
  payment?: { payer: GameState['players'][number]['colour']; owner: GameState['players'][number]['colour']; owed: number; paid: number; bankrupt: boolean };
} {
  if (action.type === 'rotate') {
    if (state.phase !== 'rotate' || ![0, 90, 270].includes(action.rotation))
      throw new Error('Rotation is not allowed now');
    return {
      state: applyRotation(state, action.rotation),
      roll: null
    };
  }
  if (action.type === 'roll') {
    if (state.phase !== 'move')
      throw new Error('Rolling is not allowed now');
    const roll = rollDie(rng);
    const moved = moveAssam(state, roll);
    const payment = settlePayment(moved);
    let next = {
      ...payment.state,
      phase: 'place' as GameState['phase']
    };
    if (payment.bankrupt || legalPlacements(next).length === 0)
      next = advanceTurn(next);
    return {
      state: next,
      roll,
      ...(payment.toColour ? { payment: { payer: state.players[state.turnIndex].colour, owner: payment.toColour, owed: countConnectedColour(moved.board, moved.assam.pos), paid: payment.paid, bankrupt: payment.bankrupt } } : {})
    };
  }
  const placementIsLegal = state.phase === 'place' && legalPlacements(state).some(p =>
    p.anchor.col === action.placement.anchor.col &&
    p.anchor.row === action.placement.anchor.row &&
    p.second.col === action.placement.second.col &&
    p.second.row === action.placement.second.row
  );
  if (!placementIsLegal) {
    throw new Error('Illegal rug placement');
  }
  return {
    state: applyPlacement(state, action.placement),
    roll: null
  };
}
