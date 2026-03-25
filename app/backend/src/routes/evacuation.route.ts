import { Router } from 'express';
import { z } from 'zod';
import { pubSub } from 'config';
import { AppError } from '@/errors/AppError';
import { asyncHandler } from '@/middleware';
import type { EvacuationCommand } from '@/types/building-commands.types';
import { rtdb } from '@root/config/firebase';
import { MQTT_TOPICS } from '@/helpers/mqtt-topics';

const evacuationRoute = Router();

const evacuationCommandSchema = z.object({
  evacuationMode: z.union([z.boolean(), z.enum(['true', 'false'])]),
  sourceFloor: z.string().optional(),
  sourceLocation: z.string().optional(),
  targetFloors: z.array(z.string()).optional(),
});

evacuationRoute.post(
  '/evacuation/trigger',
  asyncHandler(async (req, res) => {
    const parsedBody = evacuationCommandSchema.safeParse(req.body);

    if (!parsedBody.success) {
      throw new AppError(
        parsedBody.error.issues[0]?.message ??
          'evacuationMode must be true or false',
        400,
      );
    }

    const command: EvacuationCommand = {
      evacuationMode:
        parsedBody.data.evacuationMode === true ||
        parsedBody.data.evacuationMode === 'true'
          ? 'true'
          : 'false',
      sourceFloor: parsedBody.data.sourceFloor,
      sourceLocation: parsedBody.data.sourceLocation,
      targetFloors: parsedBody.data.targetFloors,
      triggeredAt: new Date().toISOString(),
      reason: 'manual',
    };

    await pubSub.publish(MQTT_TOPICS.EVACUATION_COMMAND, command, {
      retain: true,
    });

    await Promise.all([
      rtdb.ref(MQTT_TOPICS.EVACUATION_COMMAND).set(command),
      rtdb.ref(MQTT_TOPICS.EVACUATION_STATE).set(command),
    ]);

    return res.status(202).json({
      topic: MQTT_TOPICS.EVACUATION_COMMAND,
      published: true,
      command,
    });
  }),
);

export default evacuationRoute;
