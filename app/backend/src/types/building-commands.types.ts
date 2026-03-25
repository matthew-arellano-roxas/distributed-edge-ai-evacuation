export type EvacuationCommand = {
  evacuationMode: 'true' | 'false';
  sourceFloor?: string;
  sourceLocation?: string;
  targetFloors?: string[];
  triggeredAt?: string;
  reason?: 'fire_detected' | 'manual';
};
