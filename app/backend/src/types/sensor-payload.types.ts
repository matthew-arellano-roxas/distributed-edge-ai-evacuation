export interface FlamePayload {
  type: 'flame';
  detected: boolean;
  deviceId: string;
  updatedAt: string;
}

export interface PresencePayload {
  type: 'presence';
  detected: boolean;
  deviceId: string;
  updatedAt: string;
}

export interface TemperaturePayload {
  type: 'temperature';
  value: number;
  unit: string;
  deviceId: string;
  updatedAt: string;
}

export interface MQ2Payload {
  type: 'mq2';
  detected: boolean;
  value: number;
  deviceId: string;
  updatedAt: string;
}
