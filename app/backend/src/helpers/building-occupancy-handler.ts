import type { MqttClient } from 'mqtt';
import { logger } from '@root/config';
import { rtdb } from '@root/config/firebase';
import { MQTT_TOPICS } from './mqtt-topics';

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
): Promise<void> {
  const floorOccupancyRef = rtdb.ref(`${MQTT_TOPICS.OCCUPANCY}/${floor}`);
  const snapshot = await floorOccupancyRef.get();
  const currentData = snapshot.exists()
    ? (snapshot.val() as Partial<FloorOccupancy>)
    : null;
  const currentOccupancy = currentData?.occupancy ?? 0;
  const occupancy = nextOccupancyValue(currentOccupancy, movement);

  await floorOccupancyRef.set({ floor, occupancy } as FloorOccupancy);
}

async function saveTotalOccupancy(movement: number): Promise<void> {
  const baseRef = rtdb.ref(TOTAL_OCCUPANCY_PATH);
  const snapshot = await baseRef.get();
  const currentData = snapshot.exists()
    ? (snapshot.val() as Partial<StoredOccupancy>)
    : null;
  const currentOccupancy = currentData?.occupancy ?? 0;
  const occupancy = nextOccupancyValue(currentOccupancy, movement);

  await baseRef.set({ occupancy } as StoredOccupancy);
}

export async function applyOccupancyDelta(
  floor: string,
  movement: number,
): Promise<void> {
  await Promise.all([
    saveFloorOccupancy(floor, movement),
    saveTotalOccupancy(movement),
  ]);
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
      await applyOccupancyDelta(floor, movement);
      logger.info('Successfully saved floor occupancy', {
        topic,
        floor,
        movement,
      });
      return;
    }

    await saveTotalOccupancy(movement);
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
