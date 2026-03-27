import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '@/middleware';
import {
  emptyOverview,
  getCachedDashboardEvents,
  getCachedDashboardOverview,
} from '@/services/dashboard-state-service';

const dashboardRoute = Router();

const eventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

dashboardRoute.get(
  '/dashboard/overview',
  asyncHandler(async (_req, res) => {
    const cachedOverview = await getCachedDashboardOverview();
    return res.status(200).json(cachedOverview ?? emptyOverview());
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

    const events = (await getCachedDashboardEvents()) ?? [];
    return res.status(200).json({
      events: events.slice(0, parsed.data.limit),
      count: Math.min(events.length, parsed.data.limit),
    });
  }),
);

export default dashboardRoute;
