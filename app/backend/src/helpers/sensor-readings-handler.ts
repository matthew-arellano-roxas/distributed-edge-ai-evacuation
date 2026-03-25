import { SENSOR_TOPICS } from '@/commands/topics/sensor-topics';
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
import { applyOccupancyDelta } from './building-occupancy-handler';

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

type PersistedDeviceStatus = {
  status?: string | number;
  deviceName?: string;
  floor?: string | number;
};

function parseTopic(topic: string) {
  const parts = topic.split('/');
  const floor = parts[2] ?? '';
  const sensorType = parts[parts.length - 1] ?? '';
  const placeId = parts.length === 5 ? (parts[3] ?? floor) : floor;
  return { floor, placeId, sensorType };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toBooleanString(value: unknown): boolean {
  return value === true || value === 'true';
}

function normalizeSensorPayload(
  sensorType: string,
  floor: string,
  placeId: string,
  data: SensorData | Record<string, unknown>,
): SensorData | null {
  if (!isRecord(data)) {
    return null;
  }

  const deviceId = `${floor}:${placeId}`;
  const updatedAt = new Date().toISOString();

  if (sensorType === 'flame') {
    return {
      type: 'flame',
      detected: toBooleanString(data.detected ?? data.isFlameDetected),
      intensity: Number(data.intensity ?? data.rawValue ?? 0),
      deviceId,
      updatedAt,
      location: String(data.location ?? placeId),
    } as FlamePayload;
  }

  if (sensorType === 'gas' || sensorType === 'mq2') {
    return {
      type: 'mq2',
      detected: toBooleanString(data.detected ?? data.isDetected),
      value: Number(data.value ?? data.level ?? 0),
      deviceId,
      updatedAt,
    } as MQ2Payload;
  }

  if (sensorType === 'presence') {
    return {
      type: 'presence',
      detected: toBooleanString(data.detected ?? data.presence),
      deviceId,
      updatedAt,
      location: String(data.location ?? placeId),
    } as PresencePayload;
  }

  if (sensorType === 'temperature') {
    return {
      type: 'temperature',
      value: Number(data.value ?? data.temperature ?? 0),
      humidity:
        typeof data.humidity === 'number'
          ? data.humidity
          : Number(data.humidity),
      unit: String(data.unit ?? 'C'),
      deviceId,
      updatedAt,
    } as TemperaturePayload;
  }

  return null;
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

async function getTargetFloors(sourceFloor: string): Promise<string[]> {
  const snapshot = await rtdb.ref(MQTT_TOPICS.DEVICE_STATUS_ROOT).get();
  if (!snapshot.exists()) {
    return [];
  }

  const value = snapshot.val() as Record<
    string,
    Record<string, PersistedDeviceStatus> | undefined
  >;

  const floors = new Set<string>();

  for (const [floor, devices] of Object.entries(value)) {
    if (!devices || floor === sourceFloor) {
      continue;
    }

    const hasOnlineMainController = Object.values(devices).some((device) => {
      const status = String(device?.status ?? '').toLowerCase();
      const deviceName = String(device?.deviceName ?? '').toLowerCase();

      return status === 'online' && deviceName.includes('main');
    });

    if (hasOnlineMainController) {
      floors.add(floor);
    }
  }

  return [...floors];
}

async function persistEvacuationCommand(
  command: EvacuationCommand,
): Promise<void> {
  await Promise.all([
    pubSub.publish(MQTT_TOPICS.EVACUATION_COMMAND, command, { retain: true }),
    rtdb.ref(MQTT_TOPICS.EVACUATION_COMMAND).set(command),
    rtdb.ref(MQTT_TOPICS.EVACUATION_STATE).set(command),
  ]);
}

export async function handleSensorReadings(
  topic: string,
  data: SensorData | Record<string, unknown>,
): Promise<void> {
  if (!topic.includes(MQTT_TOPICS.SENSOR_READINGS)) {
    return;
  }

  const { floor, placeId, sensorType } = parseTopic(topic);
  const normalized = normalizeSensorPayload(sensorType, floor, placeId, data);
  if (!normalized) {
    return;
  }
  const ref = rtdb.ref(
    `${MQTT_TOPICS.SENSOR_READINGS}/${floor}/${placeId}/${sensorType}`,
  );
  const previousSnapshot =
    normalized.type === 'presence' ? await ref.get() : null;

  if (normalized.type === 'flame' && normalized.detected) {
    const message = `Fire detected in ${placeId} on floor ${floor}`;
    const targetFloors = await getTargetFloors(floor);
    const command: EvacuationCommand = {
      evacuationMode: 'true',
      sourceFloor: floor,
      sourceLocation: placeId,
      targetFloors,
      triggeredAt: new Date().toISOString(),
      reason: 'fire_detected',
    };

    await persistEvacuationCommand(command);

    await pubSub.publish(MQTT_TOPICS.EVACUATION_ALERTS, {
      message,
      voice: 'fire_alert',
      placeId,
      floor,
      targetFloors,
    });

    await createSensorEvent({
      floor,
      placeId,
      sensorType,
      eventType: 'fire_detected',
      message,
      data: normalized,
    });
  }

  if (normalized.type === 'mq2' && normalized.detected) {
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
      data: normalized,
    });
  }

  if (normalized.type === 'temperature' && normalized.value > 40) {
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
      data: normalized,
    });
  }

  if (
    normalized.type === 'presence' &&
    normalized.detected &&
    placeId.startsWith('fire-exit-')
  ) {
    const previousData = previousSnapshot?.exists()
      ? (previousSnapshot.val() as Partial<PresencePayload>)
      : null;
    const wasDetected = previousData?.detected === true;

    if (!wasDetected) {
      await applyOccupancyDelta(floor, -1);

      await createSensorEvent({
        floor,
        placeId,
        sensorType,
        eventType: 'exit_presence_detected',
        message: `Presence detected near ${placeId} on floor ${floor}`,
        data: normalized,
      });
    }
  }

  await ref.set(normalized);
}

export function subscribeToSensors(client: MqttClient): void {
  client.subscribe(SENSOR_TOPICS.ALL);
}
