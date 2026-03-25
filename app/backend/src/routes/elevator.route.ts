import { Router } from 'express';
import { z } from 'zod';
import { pubSub } from 'config';
import { AppError } from '@/errors/AppError';
import { getBuildingControlTopic } from '@/helpers/mqtt-topics';

const elevatorRoute = Router();

const elevatorCommandSchema = z.object({
  floor: z.number().int().min(1).max(3),
  controllerFloor: z.string().default('floor1'),
});

elevatorRoute.post('/elevator/control', async (req, res) => {
  const parsedBody = elevatorCommandSchema.safeParse(req.body);

  if (!parsedBody.success) {
    throw new AppError(
      'floor must be an integer from 1 to 3 and controllerFloor must be a string',
      400,
    );
  }

  const topic = getBuildingControlTopic(
    parsedBody.data.controllerFloor,
    'elevator',
  );
  const command = { floor: parsedBody.data.floor };

  await pubSub.publish(topic, command);

  return res.status(202).json({
    topic,
    published: true,
    command,
  });
});

export default elevatorRoute;
