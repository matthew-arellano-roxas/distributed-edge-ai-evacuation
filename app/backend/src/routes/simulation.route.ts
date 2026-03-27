import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '@/middleware';
import { db, rtdb } from '@root/config/firebase';
import { clearDashboardStateCache } from '@/services/dashboard-state-service';

const simulationRoute = Router();

const resetSimulationSchema = z.object({
  target: z.enum(['realtime', 'firestore', 'both']).default('both'),
});

simulationRoute.delete(
  '/simulation/reset',
  asyncHandler(async (req, res) => {
    const parsedBody = resetSimulationSchema.safeParse(req.body ?? {});

    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'target must be one of: realtime, firestore, both',
      });
    }

    const { target } = parsedBody.data;

    if (target === 'realtime' || target === 'both') {
      await rtdb.ref().remove();
    }

    if (target === 'firestore' || target === 'both') {
      const collections = await db.listCollections();

      await Promise.all(
        collections.map(async (collection) => {
          await db.recursiveDelete(collection);
        }),
      );
    }

    await clearDashboardStateCache();

    return res.status(200).json({
      cleared: true,
      target,
    });
  }),
);

export default simulationRoute;
