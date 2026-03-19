export const MQTT_TOPICS = {
  ELEVATOR_STATE: 'building/elevator',
  SENSOR_READINGS: 'building/sensors',
  DEVICE_STATUS: 'building/devices',
  EVACUATION_ALERTS: 'building/evacuation/alerts',
  EVACUATION_ACTIONS: 'building/evacuation/actions',
  OCCUPANCY: 'building/occupancy',
} as const;

export function getFloorOccupancyTopic(floor: string): string {
  return `${MQTT_TOPICS.OCCUPANCY}/${floor}`;
}
