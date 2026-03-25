import { MQTT_TOPICS } from '@/helpers/mqtt-topics';

export const SENSOR_TOPICS = {
  ALL: `${MQTT_TOPICS.SENSOR_READINGS}/#`,
  TEMPERATURE: `${MQTT_TOPICS.SENSOR_READINGS}/+/temperature`,
  FLAME: `${MQTT_TOPICS.SENSOR_READINGS}/+/+/flame`,
  MQ2: `${MQTT_TOPICS.SENSOR_READINGS}/+/gas`,
  PRESENCE: `${MQTT_TOPICS.SENSOR_READINGS}/+/+/presence`,
} as const;
