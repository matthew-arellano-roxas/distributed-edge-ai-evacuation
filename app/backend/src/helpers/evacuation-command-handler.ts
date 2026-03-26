import type { MqttClient } from 'mqtt';
import { logger } from '@root/config';
import { rtdb } from '@root/config/firebase';
import { MQTT_TOPICS } from './mqtt-topics';
import type { EvacuationCommand } from '@/types/building-commands.types';

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function normalizeEvacuationCommand(
  payload: unknown,
): EvacuationCommand | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const value = payload as Record<string, unknown>;
  const mode = value.evacuationMode;

  if (
    mode !== true &&
    mode !== false &&
    mode !== 'true' &&
    mode !== 'false'
  ) {
    return null;
  }

  return {
    evacuationMode: mode === true || mode === 'true' ? 'true' : 'false',
    sourceFloor:
      typeof value.sourceFloor === 'string' ? value.sourceFloor : undefined,
    sourceLocation:
      typeof value.sourceLocation === 'string' ? value.sourceLocation : undefined,
    targetFloors: isStringArray(value.targetFloors)
      ? value.targetFloors
      : undefined,
    triggeredAt:
      typeof value.triggeredAt === 'string'
        ? value.triggeredAt
        : new Date().toISOString(),
    reason:
      value.reason === 'fire_detected' || value.reason === 'manual'
        ? value.reason
        : undefined,
  };
}

export async function handleEvacuationCommand(
  topic: string,
  payload: unknown,
): Promise<void> {
  if (topic !== MQTT_TOPICS.EVACUATION_COMMAND) {
    return;
  }

  const command = normalizeEvacuationCommand(payload);
  if (!command) {
    logger.warn('Invalid evacuation command payload', { topic, payload });
    return;
  }

  try {
    await Promise.all([
      rtdb.ref(MQTT_TOPICS.EVACUATION_COMMAND).set(command),
      rtdb.ref(MQTT_TOPICS.EVACUATION_STATE).set(command),
    ]);
    logger.info('Successfully saved evacuation command', { topic, command });
  } catch (error) {
    logger.error('Failed to save evacuation command', {
      error: error instanceof Error ? error.message : String(error),
      topic,
    });
  }
}

export function subscribeToEvacuationCommand(client: MqttClient): void {
  client.subscribe(MQTT_TOPICS.EVACUATION_COMMAND);
}
