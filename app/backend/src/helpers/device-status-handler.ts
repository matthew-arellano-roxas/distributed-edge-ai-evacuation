import type { MqttClient } from 'mqtt';
import { logger } from '@root/config';
import { MQTT_TOPICS } from './mqtt-topics';
import { patchDashboardOverviewBranch } from '@/services/dashboard-state-service';
import type {
  DeviceStatusFirebaseRecord,
  DeviceStatusMqttPayload,
} from '@/types/device-status.types';

function parseDeviceStatusTopic(topic: string) {
  const [, floor] = topic.split('/');
  return { floor };
}

function isDeviceStatusTopic(topic: string): boolean {
  return /^building\/[^/]+\/devices$/.test(topic);
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

export async function handleDeviceStatus(
  topic: string,
  data: DeviceStatusMqttPayload,
): Promise<void> {
  if (!isDeviceStatusTopic(topic)) {
    return;
  }

  logger.info('Handling device status payload', { topic, data });

  const { floor } = parseDeviceStatusTopic(topic);
  const deviceId = String(data.deviceId ?? data.deviceName ?? '').trim();

  if (!deviceId) {
    logger.warn('Skipping device status without deviceId', { topic, data });
    return;
  }

  const floorKey = String(data.floor ?? floor ?? '').trim();
  if (!floorKey) {
    logger.warn('Skipping device status without floor', {
      topic,
      data,
      deviceId,
    });
    return;
  }

  const now = Date.now();
  const payload = omitUndefined<DeviceStatusFirebaseRecord>({
    ...data,
    deviceId,
    floor: floorKey,
    heartbeat: typeof data.heartbeat === 'number' ? data.heartbeat : undefined,
    lastSeen: now,
  });

  try {
    await Promise.all([
      patchDashboardOverviewBranch('devices', [floorKey, deviceId], payload),
      patchDashboardOverviewBranch('latestDevices', [deviceId], payload),
    ]);
    logger.info('Successfully saved latest device status', {
      topic,
      deviceId,
      floor: floorKey,
      payload,
    });
  } catch (error) {
    await Promise.all([
      patchDashboardOverviewBranch('devices', [floorKey, deviceId], payload),
      patchDashboardOverviewBranch('latestDevices', [deviceId], payload),
    ]);
    logger.error('Failed to save device status', {
      error: error instanceof Error ? error.message : String(error),
      topic,
      deviceId,
      floor: floorKey,
      payload,
    });
  }
}

export function subscribeToDeviceStatus(client: MqttClient): void {
  client.subscribe(`building/+${MQTT_TOPICS.DEVICE_STATUS_SUFFIX}`);
  logger.info('Subscribed to device status topics', {
    topic: `building/+${MQTT_TOPICS.DEVICE_STATUS_SUFFIX}`,
  });
}
