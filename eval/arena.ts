// The eval arena: play N seeded games between two agents and report aggregate
// metrics — win rate, illegal-move rate, average rent paid, decision latency,
// and game length. This is the artifact that says "I can measure and harden an
// agent", not just call one.
//
// Runs under tsx as a plain Node script, so timers and RNG are unrestricted.
import {
  newGame,
  rollDie,
  moveAssam,
  settlePayment,
  isGameOver,
  winnerOf,
  scoreOf,
  applyRotation,
  applyPlacement,
  legalPlacements,
  type AsyncAgent,
  type Colour,
  type GameState,
} from '@marrakech/engine';

// A small seedable PRNG (mulberry32) so each game is reproducible from a seed.
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type GameMetrics = {
  winner: Colour | 'tie';
  turns: number;
  rentPaid: Record<Colour, number>;
};

const MAX_TURNS = 2000; // safety backstop against a non-terminating game

// Play one full 2-player game. agents[0] controls the first seat (colour c),
// agents[1] the second (colour y). Returns the outcome plus per-colour rent.
export async function playGame(
  agents: [AsyncAgent, AsyncAgent],
  seed: number,
): Promise<GameMetrics> {
  const rng = makeRng(seed);
  let state: GameState = newGame(2, rng);
  const rentPaid: Record<Colour, number> = { c: 0, y: 0, r: 0, p: 0 };
  let turns = 0;

  while (!isGameOver(state) && state.phase !== 'gameover' && turns < MAX_TURNS) {
    turns++;
    const seat = state.turnIndex; // 0 or 1
    const agent = agents[seat];
    const mover = state.players[seat].colour;

    // 1) rotate
    const deg = await agent.chooseRotation(state, rng);
    state = applyRotation(state, deg);

    // 2) roll + walk (we only need the destination, not the animation)
    const die = rollDie(rng);
    const settled = settlePayment(moveAssam(state, die));
    state = settled.state;
    if (settled.paid > 0) rentPaid[mover] += settled.paid;

    // 3) place (unless the mover just went bankrupt)
    if (state.players[seat].out) {
      state = { ...state, phase: 'place' }; // advance via the no-move branch below
    }
    state = { ...state, phase: 'place' };
    const placement = legalPlacements(state).length ? await agent.choosePlacement(state, rng) : null;
    state = placement
      ? applyPlacement(state, placement)
      : applyPlacement(state, { anchor: state.assam.pos, second: state.assam.pos }); // no legal move → turn passes
  }

  return { winner: winnerOf(state), turns, rentPaid };
}

export type AgentStats = {
  name: string;
  wins: number;
  illegalMoves: number;
  totalDecisions: number;
  totalLatencyMs: number;
};

export type MatchReport = {
  games: number;
  ties: number;
  a: AgentStats;
  b: AgentStats;
  avgTurns: number;
};

// Run a match of `games` between two agent *factories* (so per-game illegal-move
// and latency counters can be wired fresh each game). Each factory receives the
// game's seat colour and a counter sink.
export type AgentFactory = (sink: AgentSink) => AsyncAgent;
export type AgentSink = { illegal: () => void };

export async function runMatch(
  nameA: string,
  factoryA: AgentFactory,
  nameB: string,
  factoryB: AgentFactory,
  games: number,
): Promise<MatchReport> {
  const a: AgentStats = { name: nameA, wins: 0, illegalMoves: 0, totalDecisions: 0, totalLatencyMs: 0 };
  const b: AgentStats = { name: nameB, wins: 0, illegalMoves: 0, totalDecisions: 0, totalLatencyMs: 0 };
  let ties = 0;
  let totalTurns = 0;

  for (let g = 0; g < games; g++) {
    // Alternate who takes the first seat to cancel any first-mover bias.
    const swap = g % 2 === 1;
    const seat0Factory = swap ? factoryB : factoryA;
    const seat1Factory = swap ? factoryA : factoryB;
    const seat0Stats = swap ? b : a;
    const seat1Stats = swap ? a : b;

    const wrapped0 = instrument(seat0Factory, seat0Stats);
    const wrapped1 = instrument(seat1Factory, seat1Stats);

    const { winner, turns } = await playGame([wrapped0, wrapped1], g + 1);
    totalTurns += turns;

    if (winner === 'tie') ties++;
    else if (winner === 'c') seat0Stats.wins++; // colour c is always seat 0
    else if (winner === 'y') seat1Stats.wins++; // colour y is always seat 1
  }

  return { games, ties, a, b, avgTurns: totalTurns / games };
}

// Wrap an agent so each decision updates latency + decision counts on `stats`,
// and illegal moves (reported by the LLM agent's sink) accumulate too.
function instrument(factory: AgentFactory, stats: AgentStats): AsyncAgent {
  const agent = factory({ illegal: () => stats.illegalMoves++ });
  return {
    name: agent.name,
    chooseRotation: async (state, rng) => {
      const t0 = Date.now();
      const r = await agent.chooseRotation(state, rng);
      stats.totalLatencyMs += Date.now() - t0;
      stats.totalDecisions++;
      return r;
    },
    choosePlacement: async (state, rng) => {
      const t0 = Date.now();
      const r = await agent.choosePlacement(state, rng);
      stats.totalLatencyMs += Date.now() - t0;
      stats.totalDecisions++;
      return r;
    },
  };
}

// Render a report as a compact text table.
export function formatReport(r: MatchReport): string {
  const pct = (n: number) => `${((n / r.games) * 100).toFixed(0)}%`;
  const line = (s: AgentStats) =>
    [
      s.name.padEnd(10),
      `wins ${String(s.wins).padStart(3)} (${pct(s.wins).padStart(4)})`,
      `illegal ${String(s.illegalMoves).padStart(4)}`,
      `avg latency ${(s.totalLatencyMs / Math.max(1, s.totalDecisions)).toFixed(1)}ms`,
    ].join('   ');
  return [
    `Match: ${r.a.name} vs ${r.b.name}  —  ${r.games} games, ${r.ties} ties, avg ${r.avgTurns.toFixed(0)} turns`,
    '  ' + line(r.a),
    '  ' + line(r.b),
  ].join('\n');
}

export { scoreOf };
