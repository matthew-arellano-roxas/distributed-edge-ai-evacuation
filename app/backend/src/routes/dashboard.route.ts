import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '@/middleware';
import { db, rtdb } from '@root/config/firebase';
import { MQTT_TOPICS } from '@/helpers/mqtt-topics';

const dashboardRoute = Router();

const eventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

async function readRealtimePath<T>(path: string): Promise<T | null> {
  const snapshot = await rtdb.ref(path).get();
  return snapshot.exists() ? (snapshot.val() as T) : null;
}

dashboardRoute.get(
  '/dashboard/overview',
  asyncHandler(async (_req, res) => {
    const [devices, latestDevices, sensors, occupancy, evacuation, elevators] =
      await Promise.all([
        readRealtimePath<Record<string, unknown>>(MQTT_TOPICS.DEVICE_STATUS_ROOT),
        readRealtimePath<Record<string, unknown>>('building/device_status'),
        readRealtimePath<Record<string, unknown>>(MQTT_TOPICS.SENSOR_READINGS),
        readRealtimePath<Record<string, unknown>>(MQTT_TOPICS.OCCUPANCY),
        readRealtimePath<Record<string, unknown>>(MQTT_TOPICS.EVACUATION_STATE),
        readRealtimePath<Record<string, unknown>>(MQTT_TOPICS.ELEVATOR_STATE),
      ]);

    return res.status(200).json({
      devices,
      latestDevices,
      sensors,
      occupancy,
      evacuation,
      elevators,
      refreshedAt: new Date().toISOString(),
    });
  }),
);

dashboardRoute.get(
  '/dashboard/events',
  asyncHandler(async (req, res) => {
    const parsed = eventsQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'limit must be an integer between 1 and 100',
      });
    }

    const snapshot = await db
      .collection('sensor_events')
      .orderBy('createdAt', 'desc')
      .limit(parsed.data.limit)
      .get();

    const events = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.status(200).json({
      events,
      count: events.length,
    });
  }),
);

export default dashboardRoute;
