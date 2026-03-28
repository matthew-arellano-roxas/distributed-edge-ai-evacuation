import type { MqttClient } from 'mqtt';
import { logger } from '@root/config';
import { MQTT_TOPICS } from './mqtt-topics';
import { patchDashboardOverviewBranch } from '@/services/dashboard-state-service';

export type ElevatorState = {
  currentFloor: number;
  targetFloor?: number;
  isMoving?: boolean;
};

export async function handleElevatorState(topic: string, data: ElevatorState) {
  const [, , floor, key] = topic.split('/');
  try {
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
