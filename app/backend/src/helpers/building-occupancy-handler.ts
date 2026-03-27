import type { MqttClient } from 'mqtt';
import { logger } from '@root/config';
import { MQTT_TOPICS } from './mqtt-topics';
import {
  getDashboardOverviewOrEmpty,
  patchDashboardOverviewBranch,
} from '@/services/dashboard-state-service';

// MQTT
export type Occupancy = {
  movement: number; // Positive Negative
};

// Firebase
export type StoredOccupancy = {
  occupancy: number;
};

export type FloorOccupancy = {
  floor: string;
  occupancy: number;
};

const TOTAL_OCCUPANCY_PATH = `${MQTT_TOPICS.OCCUPANCY}/summary`;

function parseFloorFromTopic(topic: string): string | null {
  const [, , floor] = topic.split('/');
  return floor ?? null;
}

function isOccupancyTopic(topic: string): boolean {
  return topic.includes(MQTT_TOPICS.OCCUPANCY);
}

function normalizeMovement(data: Occupancy): number | null {
  if (typeof data.movement !== 'number' || Number.isNaN(data.movement)) {
    return null;
  }

  return data.movement;
}

function nextOccupancyValue(currentValue: number, movement: number): number {
  return Math.max(0, currentValue + movement);
}

async function saveFloorOccupancy(
  floor: string,
  movement: number,
): Promise<FloorOccupancy> {
  const overview = await getDashboardOverviewOrEmpty();
  const currentData = (overview.occupancy?.[floor] as Partial<FloorOccupancy>) ?? null;
  const currentOccupancy = currentData?.occupancy ?? 0;
  const occupancy = nextOccupancyValue(currentOccupancy, movement);

  const payload = { floor, occupancy } as FloorOccupancy;
  return payload;
}

async function saveTotalOccupancy(movement: number): Promise<StoredOccupancy> {
  const overview = await getDashboardOverviewOrEmpty();
  const currentData =
    (overview.occupancy?.summary as Partial<StoredOccupancy>) ?? null;
  const currentOccupancy = currentData?.occupancy ?? 0;
  const occupancy = nextOccupancyValue(currentOccupancy, movement);

  const payload = { occupancy } as StoredOccupancy;
  return payload;
}

export async function applyOccupancyDelta(
  floor: string,
  movement: number,
): Promise<{
  floor: FloorOccupancy;
  summary: StoredOccupancy;
}> {
  const [floorPayload, summaryPayload] = await Promise.all([
    saveFloorOccupancy(floor, movement),
    saveTotalOccupancy(movement),
  ]);

  return {
    floor: floorPayload,
    summary: summaryPayload,
  };
}

export async function handleOccupancy(topic: string, data: Occupancy) {
  if (!isOccupancyTopic(topic)) {
    return;
  }

  const movement = normalizeMovement(data);
  if (movement === null) {
    logger.warn('Invalid occupancy payload', { topic, data });
    return;
  }

  const floor = parseFloorFromTopic(topic);

  try {
    if (floor) {
      const next = await applyOccupancyDelta(floor, movement);
      await Promise.all([
        patchDashboardOverviewBranch('occupancy', [floor], next.floor),
        patchDashboardOverviewBranch('occupancy', ['summary'], next.summary),
      ]);
      logger.info('Successfully saved floor occupancy', {
        topic,
        floor,
        movement,
      });
      return;
    }

    const summary = await saveTotalOccupancy(movement);
    await patchDashboardOverviewBranch('occupancy', ['summary'], summary);
    logger.info('Successfully saved total occupancy', { topic, movement });
  } catch (error) {
    logger.error('Failed to save occupancy', {
      error: error instanceof Error ? error.message : String(error),
      topic,
      movement,
      floor,
    });
  }
}

export function subscribeToOccupancy(client: MqttClient): void {
  client.subscribe(`${MQTT_TOPICS.OCCUPANCY}/#`);
}
