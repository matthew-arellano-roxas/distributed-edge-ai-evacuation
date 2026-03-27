import type { MqttClient } from 'mqtt';
import { logger } from '@root/config';
import { rtdb } from '@root/config/firebase';
import { MQTT_TOPICS } from './mqtt-topics';
import { patchDashboardOverviewBranch } from '@/services/dashboard-state-service';

export type ElevatorState = {
  currentFloor: number;
  targetFloor?: number;
  isMoving?: boolean;
};

export async function handleElevatorState(topic: string, data: ElevatorState) {
  const ref = rtdb.ref(topic);
  const [, , floor, key] = topic.split('/');
  try {
    await ref.set(data);
    await patchDashboardOverviewBranch('elevators', [floor ?? 'unknown', key ?? 'elevator'], data);
    logger.info('Successfully save the elevator state');
  } catch (error) {
    await patchDashboardOverviewBranch('elevators', [floor ?? 'unknown', key ?? 'elevator'], data);
    logger.error('Failed to save elevator state', {
      error: error instanceof Error ? error.message : String(error),
      topic,
    });
  }
}

export function subscribeToElevatorState(client: MqttClient): void {
  client.subscribe(`${MQTT_TOPICS.ELEVATOR_STATE}/+/elevator`);
}
