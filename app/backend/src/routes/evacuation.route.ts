import { Router } from 'express';
import { z } from 'zod';
import { pubSub } from 'config';
import { AppError } from '@/errors/AppError';
import { asyncHandler } from '@/middleware';
import type { EvacuationCommand } from '@/types/building-commands.types';
import { rtdb } from '@root/config/firebase';
import { MQTT_TOPICS } from '@/helpers/mqtt-topics';

const evacuationRoute = Router();

const evacuationCommandSchema = z
  .object({
    openDoors: z.boolean().optional(),
    soundAlert: z.boolean().optional(),
  })
  .refine(
    (data) => data.openDoors !== undefined || data.soundAlert !== undefined,
    {
      message: 'At least one of openDoors or soundAlert must be provided',
    },
  );

evacuationRoute.post(
  '/evacuation/trigger',
  asyncHandler(async (req, res) => {
    const parsedBody = evacuationCommandSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new AppError(
        parsedBody.error.issues[0]?.message ??
          'openDoors and soundAlert must be boolean values',
        400,
      );
    }

    const command = parsedBody.data as Partial<EvacuationCommand>;

    await pubSub.publish(MQTT_TOPICS.EVACUATION_ACTIONS, command);

    const ref = rtdb.ref(MQTT_TOPICS.EVACUATION_ACTIONS);
    await ref.set(command);

    return res.status(202).json({
      topic: MQTT_TOPICS.EVACUATION_ACTIONS,
      published: true,
      command,
    });
  }),
);

export default evacuationRoute;
