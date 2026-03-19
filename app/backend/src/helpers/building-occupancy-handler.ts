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
  total_occupancy: number;
};

export type FloorOccupancy = {
  floor: string;
  occupancy: number;
};

export async function handleOccupancy(topic: string, data: Occupancy) {
  const [, , floor] = topic.split('/');
  if (!topic.includes(MQTT_TOPICS.OCCUPANCY)) {
    return;
  }
  const baseRef = rtdb.ref(MQTT_TOPICS.OCCUPANCY);
  try {
    if (floor) {
      const floorOccupancyRef = baseRef.child(floor);
      const snapshot = await floorOccupancyRef.get();
      if (snapshot.exists()) {
        const currentData = snapshot.val() as FloorOccupancy;
        const occupancy = currentData.occupancy + data.movement; // 5 + 3 = 8 | 5 +
        await floorOccupancyRef.set({ floor, occupancy } as FloorOccupancy);
        return;
      } else {
        await floorOccupancyRef.set({
          floor,
          occupancy: data.movement,
        } as FloorOccupancy);
      }
      return;
    }
    const snapshot = await baseRef.get();

    if (snapshot.exists()) {
      const currentData = snapshot.val() as StoredOccupancy;
      const total_occupancy = currentData.total_occupancy + data.movement; // 5 + 3 = 8 | 5 +

      await baseRef.set({ total_occupancy } as StoredOccupancy);
    } else {
      await baseRef.set({ total_occupancy: data.movement } as StoredOccupancy);
    }

    logger.info('Successfully save the occupancy');
  } catch (error) {
    logger.error('Failed to save occupancy', {
      error: error instanceof Error ? error.message : String(error),
      topic,
    });
  }
}

export function subscribeToOccupancy(client: MqttClient): void {
  client.subscribe(`${MQTT_TOPICS.OCCUPANCY}/#`);
}
