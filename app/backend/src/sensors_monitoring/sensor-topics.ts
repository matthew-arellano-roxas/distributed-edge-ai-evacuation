const baseTopic: string = 'building/sensors';

export const SENSOR_TOPICS = {
  TEMPERATURE: `${baseTopic}/+/+/temperature`,
  FLAME: `${baseTopic}/+/+/flame`,
  MQ2: `${baseTopic}/+/+/mq2`,
  PRESENCE: `${baseTopic}/+/+/presence`,
} as const;
