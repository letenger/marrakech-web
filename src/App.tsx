// The scene shell. App owns only which screen is showing and the chosen
// player config; each scene component holds its own logic.
import { useState } from 'react';
import { HomeScreen } from './ui/HomeScreen';
import { SetupScreen } from './ui/SetupScreen';
import { GameScreen } from './ui/GameScreen';
import type { GameConfig } from './ui/GameScreen';
import './ui/game.css';
import './ui/scenes.css';

type Scene = 'home' | 'setup' | 'play';

export default function App() {
  const [scene, setScene] = useState<Scene>('home');
  const [config, setConfig] = useState<GameConfig | null>(null);

  if (scene === 'setup') {
    return (
      <SetupScreen
        onBack={() => setScene('home')}
        onStart={(cfg) => {
          setConfig(cfg);
          setScene('play');
        }}
      />
    );
  }

  if (scene === 'play' && config) {
    // key={count + names} remounts GameScreen for a clean game per config.
    return (
      <GameScreen
        key={`${config.count}-${Object.values(config.names).join('|')}`}
        config={config}
        onExit={() => setScene('home')}
      />
    );
  }

  return <HomeScreen onNewGame={() => setScene('setup')} />;
}
