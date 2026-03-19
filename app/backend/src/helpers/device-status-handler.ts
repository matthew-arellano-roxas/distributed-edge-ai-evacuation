import type { MqttClient } from 'mqtt';
import { logger } from '@root/config';
import { rtdb } from '@root/config/firebase';
import { MQTT_TOPICS } from './mqtt-topics';
import type {
  DeviceStatusFirebaseRecord,
  DeviceStatusMqttPayload,
} from '@/types/device-status.types';

function parseDeviceStatusTopic(topic: string) {
  const [, , floor, deviceId] = topic.split('/');
  return { floor, deviceId };
}

export async function handleDeviceStatus(
  topic: string,
  data: DeviceStatusMqttPayload,
): Promise<void> {
  if (!topic.includes(MQTT_TOPICS.DEVICE_STATUS)) {
    return;
  }

  const { floor, deviceId: topicDeviceId } = parseDeviceStatusTopic(topic);
  const deviceId = String(data.deviceId ?? topicDeviceId ?? '').trim();

  if (!deviceId) {
    logger.warn('Skipping device status without deviceId', { topic, data });
    return;
  }

  const ref = rtdb.ref(`${MQTT_TOPICS.DEVICE_STATUS}/${deviceId}`);
  const now = Date.now();
  const payload: DeviceStatusFirebaseRecord = {
    ...data,
    deviceId,
    floor,
    heartbeat: typeof data.heartbeat === 'number' ? data.heartbeat : now,
    lastSeen: now,
  };

  try {
    await ref.set(payload);
    logger.info('Successfully saved device status', { topic, deviceId });
  } catch (error) {
    logger.error('Failed to save device status', {
      error: error instanceof Error ? error.message : String(error),
      topic,
    });
  }
}

export function subscribeToDeviceStatus(client: MqttClient): void {
  client.subscribe(`${MQTT_TOPICS.DEVICE_STATUS}/#`);
}
