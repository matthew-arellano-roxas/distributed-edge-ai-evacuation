import { Router } from 'express';
import { z } from 'zod';
import { pubSub } from 'config';
import { AppError } from '@/errors/AppError';
import { MQTT_TOPICS } from '@/helpers/mqtt-topics';

const elevatorRoute = Router();

const elevatorStateSchema = z.object({
  currentFloor: z.number().finite(),
  isDoorOpen: z.boolean(),
});

elevatorRoute.post('/elevator/state', async (req, res) => {
  const parsedBody = elevatorStateSchema.safeParse(req.body);

  if (!parsedBody.success) {
    throw new AppError(
      'currentFloor must be a number and isDoorOpen must be a boolean',
      400,
    );
  }

  await pubSub.publish(MQTT_TOPICS.ELEVATOR_STATE, parsedBody.data);

  return res.status(202).json({
    topic: MQTT_TOPICS.ELEVATOR_STATE,
    published: true,
    state: parsedBody.data,
  });
});

export default elevatorRoute;
