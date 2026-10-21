import { useState } from 'react';
import { HomeScreen } from './ui/HomeScreen';
import { SetupScreen } from './ui/SetupScreen';
import { GameScreen } from './ui/GameScreen';
import type { GameConfig } from './ui/players';
import { loadSave } from './ui/persistence';
import type { GameState } from '@marrakech/engine';
import './ui/game.css';
import './ui/scenes.css';

type Scene = 'home' | 'setup' | 'play';

export default function App() {
  const [scene, setScene] = useState<Scene>('home');
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [resumeState, setResumeState] = useState<GameState | undefined>(undefined);
  const [save, setSave] = useState(loadSave); // a resumable match, if one exists

  function startNew(cfg: GameConfig) {
    setConfig(cfg);
    setResumeState(undefined);
    setScene('play');
  }

  function resume() {
    if (!save) return;
    setConfig(save.config);
    setResumeState(save.state);
    setScene('play');
  }

  function toHome() {
    setSave(loadSave());
    setScene('home');
  }

  if (scene === 'setup') {
    return <SetupScreen onBack={toHome} onStart={startNew} />;
  }

  if (scene === 'play' && config) {
    return <GameScreen config={config} resumeState={resumeState} onExit={toHome} />;
  }

  return (
    <HomeScreen
      resumable={save !== null}
      onResume={resume}
      onNewGame={() => setScene('setup')}
    />
  );
}
