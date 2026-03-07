/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Base URL of the Marrakech API (the LLM-move + game-persistence server).
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
