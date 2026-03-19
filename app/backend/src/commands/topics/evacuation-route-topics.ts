const baseTopic: string = 'building/route';

// /+ : Floor
// /+/+ : Floor/Room
export const EVACUATION_ROUTE_TOPICS = {
  ROOM: `${baseTopic}/+/+`,
  ROUTE: 'building/command',
} as const;
