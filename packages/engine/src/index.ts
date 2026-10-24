// @marrakech/engine — the pure Marrakech game core: rules, board queries,
// setup, legal-move enumeration, and the AI agents. No React, no DOM.
// Imported by the web app, the eval harness, and the API server.
export * from './game/types';
export * from './game/board';
export * from './game/rules';
export * from './game/setup';
export * from './game/moves';
export * from './game/ai/agent';
export * from './game/ai/agents';
export * from './game/ai/llm';
export * from './online';
export * from './game/transition';
