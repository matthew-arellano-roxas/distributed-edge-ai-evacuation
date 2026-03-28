import type { MqttClient } from 'mqtt';
import { logger } from '@root/config';
import { rtdb } from '@root/config/firebase';
import { MQTT_TOPICS } from './mqtt-topics';

export type ElevatorState = {
  currentFloor: number;
  isDoorOpen: boolean;
};

export async function handleElevatorState(topic: string, data: ElevatorState) {
  const ref = rtdb.ref(topic);
  try {
    await ref.set(data);
    logger.info('Successfully save the elevator state');
  } catch (error) {
    logger.error('Failed to save elevator state', {
      error: error instanceof Error ? error.message : String(error),
      topic,
    });
  }
}

export function subscribeToElevatorState(client: MqttClient): void {
  client.subscribe(MQTT_TOPICS.ELEVATOR_STATE);
}
