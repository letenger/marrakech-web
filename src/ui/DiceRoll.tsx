// A short overlay that tumbles a 3D die and lands on the rolled face.
// The cube carries the real Marrakech die net (faces 1,2,2,3,3,4) and
// resolves to the value the rules already chose, then calls onDone.
import { useEffect, useState } from 'react';

type Face = 1 | 2 | 3 | 4;

// Cube rotation that brings each value's face to the front. Extra full
// turns are added for flourish (multiples of 360 keep the resting face).
const REST: Record<Face, { x: number; y: number }> = {
  1: { x: 0, y: 0 }, // front
  2: { x: 0, y: -90 }, // right
  3: { x: 0, y: 90 }, // left
  4: { x: 0, y: -180 }, // back
};

// Phone-keypad cells (1-9) that hold a pip for each face value.
const PIPS: Record<Face, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
};

function DieFace({ cls, n }: { cls: string; n: Face }) {
  const on = new Set(PIPS[n]);
  return (
    <div className={`dice-face ${cls}`}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={on.has(i + 1) ? 'pip on' : 'pip'} />
      ))}
    </div>
  );
}

export function DiceRoll({ value, onDone }: { value: Face; onDone: () => void }) {
  const [spun, setSpun] = useState(false);

  useEffect(() => {
    const start = requestAnimationFrame(() => setSpun(true));
    const done = setTimeout(onDone, 1150);
    return () => {
      cancelAnimationFrame(start);
      clearTimeout(done);
    };
  }, [onDone]);

  const rest = REST[value];
  const transform = spun
    ? `rotateX(${1080 + rest.x}deg) rotateY(${720 + rest.y}deg)`
    : 'rotateX(-25deg) rotateY(15deg)';

  return (
    <div className="dice-backdrop">
      <div className="dice-stage">
        <div className="dice-cube" style={{ transform }}>
          <DieFace cls="df-front" n={1} />
          <DieFace cls="df-back" n={4} />
          <DieFace cls="df-right" n={2} />
          <DieFace cls="df-left" n={3} />
          <DieFace cls="df-top" n={2} />
          <DieFace cls="df-bottom" n={3} />
        </div>
      </div>
    </div>
  );
}
