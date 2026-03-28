export type DashboardOverview = {
  devices: Record<string, unknown> | null;
  latestDevices: Record<string, unknown> | null;
  sensors: Record<string, unknown> | null;
  occupancy: Record<string, unknown> | null;
  evacuation: Record<string, unknown> | null;
  elevators: Record<string, unknown> | null;
  refreshedAt: string | null;
};

export type DashboardEvent = {
  id: string;
  createdAt?: string;
  data?: Record<string, unknown>;
  eventType?: string;
  floor?: string;
  message?: string;
  placeId?: string;
  sensorType?: string;
};

export type ElevatorControlPayload = {
  floor: number;
  controllerFloor: string;
};

export type EvacuationPayload = {
  evacuationMode: boolean;
  sourceFloor?: string;
  sourceLocation?: string;
  targetFloors?: string[];
};

export type SimulationResetTarget = 'cache';
