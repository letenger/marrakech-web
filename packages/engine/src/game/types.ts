// The data shapes for Marrakech. 

// Player / rug colours. 
export type Colour = 'c' | 'y' | 'r' | 'p';

// Direction Assam faces. 
export type Facing = 'N' | 'E' | 'S' | 'W';

// A board coordinate. col = x (horizontal), row = y (vertical). Top-left is (0,0).
export type Coord = { col: number; row: number };

// A rug covers two adjacent squares — and KEEPS them after placement (fixes Java problem #2). 
export type Rug = {
  colour: Colour;
  id: number;
  squares: [Coord, Coord];
};

// A player in the game.
export type Player = {
  colour: Colour;
  dirhams: number; // money
  rugsLeft: number; // tiles still in hand
  out: boolean; // bankrupt / eliminated
};

export type Assam = {
  pos: Coord;
  facing: Facing;
};

// One board square: the rug visible on top, or null for empty sand.
export type Cell = { colour: Colour; rugId: number } | null;

// THE ONE SOURCE OF TRUTH. Treated as immutable: rules return a new GameState.
export type GameState = {
  players: Player[];
  assam: Assam;
  board: Cell[][]; // board[col][row], 7x7
  rugs: Rug[]; // every placed rug, with its two squares
  turnIndex: number; // index into players
  phase: 'rotate' | 'move' | 'place' | 'gameover';
};

export const BOARD_SIZE = 7;
