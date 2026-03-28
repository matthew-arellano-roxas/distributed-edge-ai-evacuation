import { SENSOR_TOPICS } from '@/commands/topics/sensor-topics';
import type {
  FlamePayload,
  MQ2Payload,
  TemperaturePayload,
} from '@/types/sensor-payload.types';
import { pubSub } from '@root/config';
import { logger } from '@root/config';
import { MqttClient } from 'mqtt/*';
import { EvacuationCommand } from '@/types/building-commands.types';
import { MQTT_TOPICS } from '@/helpers/mqtt-topics';
import {
  getDashboardOverviewOrEmpty,
  patchDashboardOverviewBranch,
  pushDashboardEvent,
} from '@/services/dashboard-state-service';
import { randomUUID } from 'crypto';

export type SensorData = FlamePayload | MQ2Payload | TemperaturePayload;

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
  const placeId =
    parts.length > 4 ? (parts.slice(3, -1).join('/') ?? floor) : floor;
  return { floor, placeId, sensorType };
}

function getSensorRtdbPath(
  floor: string,
  placeId: string,
  sensorType: string,
): string {
  const isFlatFloorSensor =
    placeId === floor && (sensorType === 'temperature' || sensorType === 'gas');

  if (isFlatFloorSensor) {
    return `${MQTT_TOPICS.SENSOR_READINGS}/${floor}/${sensorType}`;
  }

  return `${MQTT_TOPICS.SENSOR_READINGS}/${floor}/${placeId}/${sensorType}`;
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

  const deviceId =
    placeId === floor && (sensorType === 'temperature' || sensorType === 'gas')
      ? `${floor}:${sensorType}`
      : `${floor}:${placeId}`;
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
  const event = {
    id: randomUUID(),
    floor: params.floor,
    placeId: params.placeId,
    sensorType: params.sensorType,
    eventType: params.eventType,
    message: params.message,
    data: params.data as unknown as Record<string, unknown>,
    createdAt: new Date().toISOString(),
  };

  await pushDashboardEvent(event);
}

async function getTargetFloors(sourceFloor: string): Promise<string[]> {
  const overview = await getDashboardOverviewOrEmpty();
  if (!overview.devices) {
    return [];
  }

  const value = overview.devices as Record<
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
    patchDashboardOverviewBranch('evacuation', [], command),
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
    logger.warn('Ignoring sensor payload that could not be normalized', {
      topic,
      floor,
      placeId,
      sensorType,
      data,
    });
    return;
  }
  const rtdbPath = getSensorRtdbPath(floor, placeId, sensorType);
  logger.info('Handling sensor payload', {
    topic,
    floor,
    placeId,
    sensorType,
    rtdbPath,
    normalized,
  });

  try {
    if (normalized.type === 'flame' && normalized.detected) {
      const message = `Fire detected in ${placeId} on floor ${floor}`;
      const announcement = `Attention. Attention. Fire has been detected in ${placeId} on floor ${floor}. Please evacuate immediately and proceed to the nearest safe exit.`;
      const targetFloors = await getTargetFloors(floor);
      const command: EvacuationCommand = {
        evacuationMode: 'true',
        sourceFloor: floor,
        sourceLocation: placeId,
        targetFloors,
        triggeredAt: new Date().toISOString(),
        reason: 'fire_detected',
      };

      logger.info('Fire sensor triggered evacuation flow', {
        topic,
        placeId,
        floor,
        targetFloors,
      });

      await persistEvacuationCommand(command);
      logger.info('Persisted evacuation command from flame detection', {
        topic,
        command,
      });

      await pubSub.publish(MQTT_TOPICS.EVACUATION_ALERTS, {
        message,
        announcement,
        voice: 'fire_alert',
        placeId,
        floor,
        targetFloors,
      });
      logger.info('Published evacuation alert from flame detection', {
        topic,
        alertTopic: MQTT_TOPICS.EVACUATION_ALERTS,
        message,
      });

      await createSensorEvent({
        floor,
        placeId,
        sensorType,
        eventType: 'fire_detected',
        message,
        data: normalized,
      });
      logger.info('Created cached sensor event for flame detection', {
        topic,
        placeId,
        floor,
      });
    }

    if (normalized.type === 'mq2' && normalized.detected) {
      const message = `High concentration of gas in ${placeId} on floor ${floor}`;
      const announcement = `Attention. Attention. Gas has been detected in ${placeId} on floor ${floor}. Please avoid the area and follow evacuation instructions.`;

      logger.info('Gas sensor triggered alert flow', {
        topic,
        placeId,
        floor,
      });

      await pubSub.publish(MQTT_TOPICS.EVACUATION_ALERTS, {
        message,
        announcement,
        voice_message: 'high_gas_alert',
        placeId,
        floor,
      });
      logger.info('Published evacuation alert from gas detection', {
        topic,
        alertTopic: MQTT_TOPICS.EVACUATION_ALERTS,
        message,
      });

      await createSensorEvent({
        floor,
        placeId,
        sensorType,
        eventType: 'gas_detected',
        message,
        data: normalized,
      });
      logger.info('Created cached sensor event for gas detection', {
        topic,
        placeId,
        floor,
      });
    }

    if (normalized.type === 'temperature' && normalized.value > 40) {
      const message = `High temperature in ${placeId} on floor ${floor}`;
      const announcement = `Attention. Attention. High temperature has been detected in ${placeId} on floor ${floor}. Please stay alert and follow safety instructions.`;

      logger.info('Temperature sensor triggered alert flow', {
        topic,
        placeId,
        floor,
        value: normalized.value,
      });

      await pubSub.publish(MQTT_TOPICS.EVACUATION_ALERTS, {
        message,
        announcement,
        voice_message: 'high_temperature_alert',
        placeId,
        floor,
      });
      logger.info('Published evacuation alert from temperature threshold', {
        topic,
        alertTopic: MQTT_TOPICS.EVACUATION_ALERTS,
        message,
      });

      await createSensorEvent({
        floor,
        placeId,
        sensorType,
        eventType: 'temperature_threshold_exceeded',
        message,
        data: normalized,
      });
      logger.info('Created cached sensor event for temperature threshold', {
        topic,
        placeId,
        floor,
      });
    }

    logger.info('Updating latest sensor state', {
      topic,
      rtdbPath,
      normalized,
    });
    await patchDashboardOverviewBranch(
      'sensors',
      rtdbPath.replace(`${MQTT_TOPICS.SENSOR_READINGS}/`, '').split('/'),
      normalized,
    );
    logger.info('Saved latest sensor payload to dashboard state', {
      topic,
      floor,
      placeId,
      sensorType,
      rtdbPath,
      normalized,
    });
  } catch (error) {
    await patchDashboardOverviewBranch(
      'sensors',
      rtdbPath.replace(`${MQTT_TOPICS.SENSOR_READINGS}/`, '').split('/'),
      normalized,
    );
    logger.error('Failed sensor processing pipeline', {
      error: error instanceof Error ? error.message : String(error),
      topic,
      floor,
      placeId,
      sensorType,
      rtdbPath,
      normalized,
    });
  }
}

export function subscribeToSensors(client: MqttClient): void {
  client.subscribe(SENSOR_TOPICS.ALL);
  logger.info('Subscribed to sensor topics', {
    topic: SENSOR_TOPICS.ALL,
  });
}
