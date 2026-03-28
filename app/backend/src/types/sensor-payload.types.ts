export interface FlamePayload {
  type: 'flame';
  detected: boolean;
  intensity: number;
  deviceId: string;
  updatedAt: string;
  location?: string;
}

export interface TemperaturePayload {
  type: 'temperature';
  value: number;
  unit: string;
  deviceId: string;
  updatedAt: string;
  humidity?: number;
}

export interface MQ2Payload {
  type: 'mq2';
  detected: boolean;
  value: number;
  deviceId: string;
  updatedAt: string;
}
