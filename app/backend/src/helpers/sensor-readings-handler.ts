import { SENSOR_TOPICS } from '@/sensors_monitoring/sensor-topics';
import type {
  FlamePayload,
  MQ2Payload,
  PresencePayload,
  TemperaturePayload,
} from '@/types/sensor-payload.types';
import { pubSub } from '@root/config';
import { db, rtdb } from '@root/config/firebase';
import { MqttClient } from 'mqtt/*';
import { EvacuationCommand } from '@/types/building-commands.types';
import { MQTT_TOPICS } from '@/helpers/mqtt-topics';

export type SensorData =
  | FlamePayload
  | MQ2Payload
  | PresencePayload
  | TemperaturePayload;

export interface SensorPayload {
  floor: string;
  placeId: string;
  sensorType: string;
  data: SensorData;
}

function parseTopic(topic: string) {
  const [, , floor, placeId, sensorType] = topic.split('/');
  return { floor, placeId, sensorType };
}

async function createSensorEvent(params: {
  floor: string;
  placeId: string;
  sensorType: string;
  eventType: string;
  message: string;
  data: SensorData;
}) {
  await db.collection('sensor_events').add({
    floor: params.floor,
    placeId: params.placeId,
    sensorType: params.sensorType,
    eventType: params.eventType,
    message: params.message,
    data: params.data,
    createdAt: new Date().toISOString(),
  });
}

export async function handleSensorReadings(
  topic: string,
  data: SensorData,
): Promise<void> {
  if (!topic.includes(MQTT_TOPICS.SENSOR_READINGS)) {
    return;
  }

  const { floor, placeId, sensorType } = parseTopic(topic);
  const ref = rtdb.ref(
    `${MQTT_TOPICS.SENSOR_READINGS}/${floor}/${placeId}/${sensorType}`,
  );

  if (data.type === 'flame' && data.detected) {
    const message = `Fire detected in ${placeId} on floor ${floor}`;

    await pubSub.publish(MQTT_TOPICS.EVACUATION_ACTIONS, {
      openDoors: true,
      soundAlert: true,
    } as EvacuationCommand);

    const ref = rtdb.ref(MQTT_TOPICS.EVACUATION_ACTIONS);
    await ref.set({
      openDoors: true,
      soundAlert: true,
    } as EvacuationCommand);

    await pubSub.publish(MQTT_TOPICS.EVACUATION_ALERTS, {
      message,
      voice: 'fire_alert',
      placeId,
    });

    await createSensorEvent({
      floor,
      placeId,
      sensorType,
      eventType: 'fire_detected',
      message,
      data,
    });
  }

  if (data.type === 'mq2' && data.detected) {
    const message = `High concentration of gas in ${placeId} on floor ${floor}`;

    await pubSub.publish(MQTT_TOPICS.EVACUATION_ALERTS, {
      message,
      voice_message: 'high_gas_alert',
      placeId,
    });

    await createSensorEvent({
      floor,
      placeId,
      sensorType,
      eventType: 'gas_detected',
      message,
      data,
    });
  }

  if (data.type === 'temperature' && data.value > 40) {
    const message = `High temperature in ${placeId} on floor ${floor}`;

    await pubSub.publish(MQTT_TOPICS.EVACUATION_ALERTS, {
      message,
      voice_message: 'high_temperature_alert',
      placeId,
    });

    await createSensorEvent({
      floor,
      placeId,
      sensorType,
      eventType: 'temperature_threshold_exceeded',
      message,
      data,
    });
  }

  await ref.set(data);
}

export function subscribeToSensors(client: MqttClient): void {
  client.subscribe(SENSOR_TOPICS.FLAME);
  client.subscribe(SENSOR_TOPICS.MQ2);
  client.subscribe(SENSOR_TOPICS.PRESENCE);
  client.subscribe(SENSOR_TOPICS.TEMPERATURE);
}
