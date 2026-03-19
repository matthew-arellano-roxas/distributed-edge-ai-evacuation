export type DeviceStatusMqttPayload = {
  deviceId: string;
  deviceType: string;
  heartbeat: number;
  status: string | number;
};

export type DeviceStatusFirebaseRecord = DeviceStatusMqttPayload & {
  floor?: string | number;
  lastSeen?: number;
};
