export const MQTT_TOPICS = {
  ELEVATOR_STATE: 'building/state',
  SENSOR_READINGS: 'building/sensors',
  DEVICE_STATUS_ROOT: 'building/devices',
  DEVICE_STATUS_SUFFIX: '/devices',
  EVACUATION_ALERTS: 'building/evacuation/alerts',
  EVACUATION_COMMAND: 'building/command/evacuation',
  EVACUATION_STATE: 'building/evacuation/state',
  OCCUPANCY: 'building/occupancy',
} as const;

export function getFloorOccupancyTopic(floor: string): string {
  return `${MQTT_TOPICS.OCCUPANCY}/${floor}`;
}

export function getBuildingControlTopic(
  floor: string,
  component: string,
): string {
  return `building/control/${floor}/${component}`;
}
