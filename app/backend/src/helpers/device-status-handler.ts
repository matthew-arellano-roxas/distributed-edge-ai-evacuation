import type { MqttClient } from 'mqtt';
import { logger } from '@root/config';
import { rtdb } from '@root/config/firebase';
import { MQTT_TOPICS } from './mqtt-topics';
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

export async function handleDeviceStatus(
  topic: string,
  data: DeviceStatusMqttPayload,
): Promise<void> {
  if (!isDeviceStatusTopic(topic)) {
    return;
  }

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

  const floorRef = rtdb.ref(
    `${MQTT_TOPICS.DEVICE_STATUS_ROOT}/${floorKey}/${deviceId}`,
  );
  const latestRef = rtdb.ref(`building/device_status/${deviceId}`);
  const now = Date.now();
  const payload: DeviceStatusFirebaseRecord = {
    ...data,
    deviceId,
    floor: floorKey,
    heartbeat: typeof data.heartbeat === 'number' ? data.heartbeat : undefined,
    lastSeen: now,
  };

  try {
    await Promise.all([floorRef.set(payload), latestRef.set(payload)]);
    logger.info('Successfully saved device status', {
      topic,
      deviceId,
      floor: floorKey,
    });
  } catch (error) {
    logger.error('Failed to save device status', {
      error: error instanceof Error ? error.message : String(error),
      topic,
    });
  }
}

export function subscribeToDeviceStatus(client: MqttClient): void {
  client.subscribe(`building/+${MQTT_TOPICS.DEVICE_STATUS_SUFFIX}`);
}
