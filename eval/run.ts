// CLI entry for the eval arena. Plays a match between two agents and prints a
// metrics table. Run with: npm run eval -- [agentA] [agentB] [games]
//
//   npm run eval                      # greedy vs random, 50 games
//   npm run eval -- search greedy 100 # 100 games, search vs greedy
//   npm run eval -- llm greedy 20     # LLM (needs ANTHROPIC_API_KEY) vs greedy
//
// Agents: random | greedy | search | llm
import { AGENTS, toAsync, llmAgent } from '@marrakech/engine';
import { runMatch, formatReport, type AgentFactory } from './arena';
import { anthropicComplete } from './anthropic';

function factoryFor(name: string): AgentFactory {
  if (name === 'llm') {
    const complete = anthropicComplete();
    return (sink) => llmAgent({ complete, name: 'llm', onIllegalMove: () => sink.illegal() });
  }
  const agent = AGENTS[name];
  if (!agent) {
    throw new Error(`Unknown agent "${name}". Choose from: ${Object.keys(AGENTS).join(', ')}, llm`);
  }
  return () => toAsync(agent);
}

async function main() {
  const [a = 'greedy', b = 'random', gamesArg = '50'] = process.argv.slice(2);
  const games = Number(gamesArg);
  if (!Number.isInteger(games) || games < 1) {
    throw new Error(`games must be a positive integer, got "${gamesArg}"`);
  }

  console.log(`Running ${games} games: ${a} vs ${b}…\n`);
  const report = await runMatch(a, factoryFor(a), b, factoryFor(b), games);
  console.log(formatReport(report));
}

main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
});
