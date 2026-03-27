export type DeviceStatusMqttPayload = {
  deviceId?: string;
  deviceName?: string;
  deviceType: string;
  floor?: string | number;
  heartbeat?: number;
  status: string | number;
};

export type DeviceStatusRecord = DeviceStatusMqttPayload & {
  floor?: string | number;
  lastSeen?: number;
};
