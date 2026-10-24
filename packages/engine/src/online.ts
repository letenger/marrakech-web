import type { Colour, GameState } from './game/types';
import type { Placement, RotateChoice } from './game/moves';
export type OnlineAiKind = 'random' | 'greedy' | 'search';
export type OnlinePayment = {
  id: string; matchId: string; createdAt: number; die: number;
  payer: Colour; owner: Colour; owed: number; paid: number; bankrupt: boolean;
  payerDirhams: number; ownerDirhams: number; payerScore: number; ownerScore: number;
};
export type OnlineMember = {
  ai?: OnlineAiKind;
  guestId: string;
  name: string;
  colour: Colour;
  ready: boolean;
  connected: boolean;
};
export type OnlineRequest = {
  guestId: string;
  name: string;
  expiresAt: number;
};
export type OnlineRoomSummary = {
  id: string;
  code: string;
  name: string;
  hostName: string;
  count: number;
  capacity: number;
  status: 'waiting' | 'playing' | 'finished';
};
export type OnlineRoom = OnlineRoomSummary & {
  hostId: string;
  version: number;
  members: OnlineMember[];
  requests: OnlineRequest[];
  matchId: string | null;
  state: GameState | null;
  abandoned: boolean;
  lastRoll: number | null;
  roster?: Pick<OnlineMember, 'guestId' | 'name' | 'colour' | 'ai'>[];
  payments?: OnlinePayment[];
};
export type OnlineSnapshot = {
  revision: number;
  guestId: string;
  name: string;
  rooms: OnlineRoomSummary[];
  room: OnlineRoom | null;
  pendingRequest: {
    roomId: string;
    roomName: string;
    expiresAt: number;
  } | null;
};
export type OnlineCommand = {
  id: string;
  version?: number;
} & ({
  type: 'create';
  name: string;
  capacity: number;
} | {
  type: 'request';
  roomId: string;
} | {
  type: 'cancelRequest';
} | {
  type: 'accept' | 'decline' | 'remove';
  guestId: string;
} | {
  type: 'addAi';
  kind: OnlineAiKind;
} | {
  type: 'setAi';
  guestId: string;
  kind: OnlineAiKind;
} | {
  type: 'ready';
  ready: boolean;
} | {
  type: 'capacity';
  capacity: number;
} | {
  type: 'colour';
  colour: Colour;
} | {
  type: 'start' | 'leave' | 'rematch';
} | {
  type: 'rotate';
  rotation: RotateChoice;
} | {
  type: 'roll';
} | {
  type: 'place';
  placement: Placement;
});
